import json
import boto3
import pytest
from moto import mock_aws
import os
import sys
import time
from unittest.mock import patch, MagicMock
from botocore.exceptions import ClientError
from datetime import datetime

# Set environment variables BEFORE any imports
os.environ['AWS_DEFAULT_REGION'] = 'eu-north-1'
os.environ['CONNECTIONS_TABLE'] = 'test-connections'
os.environ['RATE_LIMIT_TABLE'] = 'test-rate-limit'
os.environ['WEBSOCKET_API_ENDPOINT'] = 'test-endpoint.execute-api.eu-north-1.amazonaws.com'
os.environ['DEBUG_MODE'] = 'true'
os.environ['OPENWEATHER_API_KEY'] = 'test-api-key'
os.environ['RATE_LIMIT_MINUTES'] = '60'
os.environ['TOKEN_FUNCTION_NAME'] = 'test-token-function'
os.environ['UPSTASH_REDIS_REST_URL'] = 'https://test-redis.upstash.io'
os.environ['UPSTASH_REDIS_REST_TOKEN'] = 'test-redis-token'


@pytest.fixture
def dynamodb_tables():
    """Create mock DynamoDB tables for testing"""
    with mock_aws():
        dynamodb_resource = boto3.resource('dynamodb', region_name='eu-north-1')

        # Connections table
        connections_table = dynamodb_resource.create_table(
            TableName='test-connections',
            KeySchema=[{'AttributeName': 'connectionId', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'connectionId', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )

        # Rate limit table
        rate_limit_table = dynamodb_resource.create_table(
            TableName='test-rate-limit',
            KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )

        yield {
            'connections': connections_table,
            'rate_limit': rate_limit_table
        }


@mock_aws
@patch('requests.get')
def test_message_echo(mock_get, dynamodb_tables):
    """Test echo message functionality"""

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-conn-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': json.dumps({
            'action': 'echo',
            'data': 'Hello WebSocket!'
        })
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    assert 'Message echoed back' in result['body']


@mock_aws
@patch('requests.post')
@patch('requests.get')
def test_message_weather_request_success(mock_get, mock_post, dynamodb_tables):
    """Test successful weather data request"""

    # Mock OpenWeatherMap API responses
    mock_current = MagicMock()
    mock_current.status_code = 200
    mock_current.json.return_value = {
        'name': 'Paris',
        'sys': {'country': 'FR', 'sunrise': 1234567890, 'sunset': 1234598490},
        'coord': {'lat': 48.85, 'lon': 2.35},
        'main': {'temp': 20, 'temp_max': 25, 'temp_min': 15, 'humidity': 60, 'pressure': 1013},
        'weather': [{'main': 'Clear', 'description': 'clear sky'}],
        'wind': {'speed': 5},
        'visibility': 10000
    }

    mock_forecast = MagicMock()
    mock_forecast.status_code = 200
    mock_forecast.json.return_value = {
        'list': [{
            'dt': int(time.time()),
            'main': {'temp': 20, 'temp_max': 25, 'temp_min': 15},
            'weather': [{'main': 'Clear'}],
            'wind': {'speed': 5}
        }] * 10
    }

    mock_uv = MagicMock()
    mock_uv.status_code = 200
    mock_uv.json.return_value = {'value': 5}

    mock_get.side_effect = [mock_current, mock_forecast, mock_uv]

    # Mock Redis response
    mock_redis_response = MagicMock()
    mock_redis_response.status_code = 200
    mock_post.return_value = mock_redis_response

    # Store a valid token - use string for timestamp like the real Lambda does
    dynamodb_tables['rate_limit'].put_item(Item={
        'id': 'token_paris_fr',
        'token': 'valid-test-token',
        'timestamp': datetime.now().isoformat(),
        'can_update': True
    })

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-conn-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': json.dumps({
            'action': 'get_weather',
            'city': 'Paris',
            'country': 'FR',
            'token': 'valid-test-token',
            'clientId': 'client-123'
        })
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    assert 'Weather data fetched' in result['body']


@mock_aws
def test_message_weather_request_missing_city(dynamodb_tables):
    """Test weather request with missing city parameter"""

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-conn-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': json.dumps({
            'action': 'get_weather',
            'country': 'FR',
            'token': 'some-token'
        })
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 400
    assert 'City and country required' in result['body']


@mock_aws
def test_message_weather_request_missing_token(dynamodb_tables):
    """Test weather request without token"""

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-conn-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': json.dumps({
            'action': 'get_weather',
            'city': 'Paris',
            'country': 'FR',
            'clientId': 'client-123'
        })
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 400
    assert 'Token required' in result['body']


@mock_aws
def test_message_weather_request_invalid_token(dynamodb_tables):
    """Test weather request with invalid token"""

    # Store a different token - use string for timestamp
    dynamodb_tables['rate_limit'].put_item(Item={
        'id': 'token_paris_fr',
        'token': 'correct-token',
        'timestamp': datetime.now().isoformat(),
        'can_update': True
    })

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-conn-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': json.dumps({
            'action': 'get_weather',
            'city': 'Paris',
            'country': 'FR',
            'token': 'wrong-token',
            'clientId': 'client-123'
        })
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 403
    assert 'Token validation failed' in result['body']


@mock_aws
def test_message_weather_request_already_used_token(dynamodb_tables):
    """Test weather request with already consumed token"""

    # Store a token that's already used - use string for timestamp
    dynamodb_tables['rate_limit'].put_item(Item={
        'id': 'token_paris_fr',
        'token': 'used-token',
        'timestamp': datetime.now().isoformat(),
        'can_update': False  # Already used
    })

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-conn-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': json.dumps({
            'action': 'get_weather',
            'city': 'Paris',
            'country': 'FR',
            'token': 'used-token',
            'clientId': 'client-123'
        })
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 403


@mock_aws
def test_message_broadcast(dynamodb_tables):
    """Test broadcast message functionality"""

    # Add multiple connections
    for i in range(3):
        dynamodb_tables['connections'].put_item(Item={
            'connectionId': f'conn-{i}',
            'timestamp': int(time.time())
        })

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'sender-conn',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': json.dumps({
            'action': 'broadcast',
            'data': 'Hello everyone!'
        })
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    assert 'broadcast' in result['body'].lower()


@mock_aws
def test_message_invalid_json_body(dynamodb_tables):
    """Test handling of invalid JSON in message body"""

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-conn-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': 'not valid json'
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 500


@mock_aws
def test_message_empty_body(dynamodb_tables):
    """Test handling of empty message body"""

    sys.path.insert(0, '.aws-sam/build/MessageFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-conn-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        },
        'body': json.dumps({})
    }

    result = lambda_handler(event, None)

    # Should default to echo with empty data
    assert result['statusCode'] == 200
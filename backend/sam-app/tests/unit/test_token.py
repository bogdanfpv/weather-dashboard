import json
import boto3
import pytest
from moto import mock_aws
import os
import sys
import time
from unittest.mock import patch, MagicMock
from datetime import datetime

# Set environment variables BEFORE any imports
os.environ['AWS_DEFAULT_REGION'] = 'eu-north-1'
os.environ['CONNECTIONS_TABLE'] = 'test-connections'
os.environ['RATE_LIMIT_TABLE'] = 'test-rate-limit'
os.environ['WEBSOCKET_API_ENDPOINT'] = 'test-endpoint.execute-api.eu-north-1.amazonaws.com'
os.environ['DEBUG_MODE'] = 'true'
os.environ['RATE_LIMIT_MINUTES'] = '60'
os.environ['DEFAULT_CITIES'] = 'Paris,FR|London,GB|Tokyo,JP'
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
@patch('urllib.request.urlopen')
def test_token_cloudformation_initialization(mock_urlopen, dynamodb_tables):
    """Test CloudFormation custom resource initialization"""

    # Mock Redis response
    mock_response = MagicMock()
    mock_response.status = 200
    mock_urlopen.return_value = mock_response

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import lambda_handler

    # CloudFormation CREATE event
    event = {
        'RequestType': 'Create',
        'ResponseURL': 'https://cloudformation-response-url.example.com',
        'StackId': 'test-stack-id',
        'RequestId': 'test-request-id',
        'LogicalResourceId': 'TokenInitializer',
        'ResourceType': 'Custom::TokenInitializer'
    }

    context = MagicMock()
    context.log_stream_name = 'test-log-stream'

    result = lambda_handler(event, context)

    # Verify tokens were created for default cities
    response = dynamodb_tables['rate_limit'].scan()
    items = response.get('Items', [])

    # Should have tokens for Paris, London, and Tokyo
    assert len(items) >= 3
    token_ids = [item['id'] for item in items]
    assert 'token_paris_fr' in token_ids
    assert 'token_london_gb' in token_ids
    assert 'token_tokyo_jp' in token_ids


@mock_aws
@patch('urllib.request.urlopen')
def test_token_refresh_action(mock_urlopen, dynamodb_tables):
    """Test token refresh for specific location"""

    # Mock Redis response
    mock_response = MagicMock()
    mock_response.status = 200
    mock_urlopen.return_value = mock_response

    # Add a connection to notify
    dynamodb_tables['connections'].put_item(Item={
        'connectionId': 'test-conn-123',
        'timestamp': int(time.time())
    })

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import lambda_handler

    event = {
        'action': 'refresh_token',
        'location_key': 'paris_fr'
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    assert 'Token refreshed' in result['body']

    # Verify token was created/updated in DynamoDB
    response = dynamodb_tables['rate_limit'].get_item(Key={'id': 'token_paris_fr'})
    assert 'Item' in response
    assert response['Item']['can_update'] == True
    assert 'token' in response['Item']
    assert 'timestamp' in response['Item']


@mock_aws
@patch('urllib.request.urlopen')
def test_token_generation_format(mock_urlopen, dynamodb_tables):
    """Test that generated tokens have correct format"""

    mock_response = MagicMock()
    mock_response.status = 200
    mock_urlopen.return_value = mock_response

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import generate_and_store_token

    token, timestamp = generate_and_store_token('london_gb', can_update=True)

    # Token should be URL-safe base64 string (at least 32 chars)
    assert len(token) >= 32
    assert isinstance(token, str)

    # Timestamp should be ISO format
    assert isinstance(timestamp, str)
    datetime.fromisoformat(timestamp)  # Should not raise


@mock_aws
@patch('urllib.request.urlopen')
def test_token_multiple_locations(mock_urlopen, dynamodb_tables):
    """Test token generation for multiple locations"""

    mock_response = MagicMock()
    mock_response.status = 200
    mock_urlopen.return_value = mock_response

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import generate_and_store_token

    locations = ['paris_fr', 'london_gb', 'tokyo_jp', 'sydney_au']

    for location in locations:
        token, timestamp = generate_and_store_token(location, can_update=True)

        # Verify stored in DynamoDB
        response = dynamodb_tables['rate_limit'].get_item(Key={'id': f'token_{location}'})
        assert 'Item' in response
        assert response['Item']['token'] == token
        assert response['Item']['can_update'] == True


@mock_aws
def test_token_refresh_missing_location_key(dynamodb_tables):
    """Test token refresh without location_key parameter"""

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import lambda_handler

    event = {
        'action': 'refresh_token'
        # Missing location_key
    }

    with pytest.raises(ValueError) as exc_info:
        lambda_handler(event, None)

    assert 'location_key is required' in str(exc_info.value)


@mock_aws
@patch('urllib.request.urlopen')
def test_token_can_update_flag(mock_urlopen, dynamodb_tables):
    """Test that can_update flag is set correctly"""

    mock_response = MagicMock()
    mock_response.status = 200
    mock_urlopen.return_value = mock_response

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import generate_and_store_token

    # Generate with can_update=True
    token1, _ = generate_and_store_token('paris_fr', can_update=True)
    response = dynamodb_tables['rate_limit'].get_item(Key={'id': 'token_paris_fr'})
    assert response['Item']['can_update'] == True

    # Generate with can_update=False
    token2, _ = generate_and_store_token('london_gb', can_update=False)
    response = dynamodb_tables['rate_limit'].get_item(Key={'id': 'token_london_gb'})
    assert response['Item']['can_update'] == False


@mock_aws
@patch('urllib.request.urlopen')
def test_token_location_key_generation(mock_urlopen, dynamodb_tables):
    """Test location key generation helper function"""

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import get_location_key

    assert get_location_key('Paris', 'FR') == 'paris_fr'
    assert get_location_key('LONDON', 'GB') == 'london_gb'
    assert get_location_key('New York', 'US') == 'new york_us'
    assert get_location_key('Tokyo', 'jp') == 'tokyo_jp'


@mock_aws
@patch('urllib.request.urlopen')
def test_token_redis_update_called(mock_urlopen, dynamodb_tables):
    """Test that Redis update is attempted"""

    mock_response = MagicMock()
    mock_response.status = 200
    mock_urlopen.return_value = mock_response

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import generate_and_store_token

    generate_and_store_token('paris_fr', can_update=True)

    # Verify Redis was called
    assert mock_urlopen.called


@mock_aws
@patch('urllib.request.urlopen')
def test_token_initialization_creates_all_default_cities(mock_urlopen, dynamodb_tables):
    """Test that initialization creates tokens for all default cities"""

    mock_response = MagicMock()
    mock_response.status = 200
    mock_urlopen.return_value = mock_response

    sys.path.insert(0, '.aws-sam/build/TokenFunction')
    from app import initialize_tables

    initialize_tables()

    # Check that tokens exist for all default cities
    expected_locations = ['paris_fr', 'london_gb', 'tokyo_jp']

    for location in expected_locations:
        response = dynamodb_tables['rate_limit'].get_item(Key={'id': f'token_{location}'})
        assert 'Item' in response
        assert response['Item']['location'] == location
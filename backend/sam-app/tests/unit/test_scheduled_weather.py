import json
import boto3
import pytest
from moto import mock_aws
import os
import sys
from unittest.mock import patch, MagicMock

# Add the path to sys.path BEFORE any other imports
sys.path.insert(0, '.aws-sam/build/ScheduledWeatherFunction')

# Set environment variables BEFORE any imports
os.environ['AWS_DEFAULT_REGION'] = 'eu-north-1'
os.environ['TOKEN_FUNCTION_ARN'] = 'arn:aws:lambda:eu-north-1:123456789:function:test-token-function'
os.environ['DEFAULT_CITIES'] = 'Paris,FR|London,GB|Tokyo,JP'
os.environ['RATE_LIMIT_TABLE'] = 'test-rate-limit'


@pytest.fixture
def lambda_client_mock():
    """Create mock Lambda client"""
    with mock_aws():
        yield boto3.client('lambda', region_name='eu-north-1')


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_token_refresh_all_cities(mock_lambda_client):
    """Test scheduled token refresh for all default cities"""

    mock_lambda_client.invoke.return_value = {
        'StatusCode': 202,
        'Payload': MagicMock()
    }

    from app import lambda_handler

    event = {}
    context = MagicMock()

    result = lambda_handler(event, context)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['total_processed'] == 3  # Paris, London, Tokyo
    assert body['successful_updates'] == 3
    assert body['failed_updates'] == 0

    # Verify Lambda was invoked 3 times (once per city)
    assert mock_lambda_client.invoke.call_count == 3


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_single_city(mock_lambda_client):
    """Test token refresh for a single city"""

    mock_lambda_client.invoke.return_value = {
        'StatusCode': 202,
        'Payload': MagicMock()
    }

    from app import lambda_handler

    event = {
        'city': 'Paris',
        'country': 'FR'
    }
    context = MagicMock()

    result = lambda_handler(event, context)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['total_processed'] == 1
    assert body['successful_updates'] == 1
    assert body['results'][0]['location'] == 'Paris, FR'

    # Verify Lambda was invoked once
    assert mock_lambda_client.invoke.call_count == 1


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_lambda_invocation_params(mock_lambda_client):
    """Test that Lambda is invoked with correct parameters"""

    mock_lambda_client.invoke.return_value = {
        'StatusCode': 202,
        'Payload': MagicMock()
    }

    from app import lambda_handler

    event = {
        'city': 'Paris',
        'country': 'FR'
    }
    context = MagicMock()

    lambda_handler(event, context)

    # Check invocation parameters
    call_args = mock_lambda_client.invoke.call_args
    assert call_args[1]['FunctionName'] == os.environ['TOKEN_FUNCTION_ARN']
    assert call_args[1]['InvocationType'] == 'Event'  # Async

    payload = json.loads(call_args[1]['Payload'])
    assert payload['action'] == 'refresh_token'
    assert payload['location_key'] == 'paris_fr'


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_lambda_error(mock_lambda_client):
    """Test handling of Lambda invocation errors"""

    mock_lambda_client.invoke.side_effect = Exception('Lambda invocation failed')

    from app import lambda_handler

    event = {
        'city': 'Paris',
        'country': 'FR'
    }
    context = MagicMock()

    result = lambda_handler(event, context)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['failed_updates'] == 1
    # When refresh_token_for_location catches an exception and returns False,
    # the status is set to 'failure', not 'error'
    assert body['results'][0]['status'] == 'failure'
    assert body['results'][0]['token_refresh_success'] == False


@mock_aws
def test_scheduled_weather_get_location_key():
    """Test location key generation"""

    from app import get_location_key

    assert get_location_key('Paris', 'FR') == 'paris_fr'
    assert get_location_key('LONDON', 'GB') == 'london_gb'
    assert get_location_key('New York', 'US') == 'new york_us'


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_refresh_token_function(mock_lambda_client):
    """Test refresh_token_for_location function directly"""

    mock_lambda_client.invoke.return_value = {
        'StatusCode': 202,
        'Payload': MagicMock()
    }

    from app import refresh_token_for_location

    result = refresh_token_for_location('paris_fr')

    assert result == True
    assert mock_lambda_client.invoke.called


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_no_token_function_arn(mock_lambda_client):
    """Test handling when TOKEN_FUNCTION_ARN is not configured"""

    old_arn = os.environ.get('TOKEN_FUNCTION_ARN')
    os.environ.pop('TOKEN_FUNCTION_ARN', None)

    from app import refresh_token_for_location

    result = refresh_token_for_location('paris_fr')

    assert result == False
    assert not mock_lambda_client.invoke.called

    # Restore ARN
    if old_arn:
        os.environ['TOKEN_FUNCTION_ARN'] = old_arn


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_partial_failure(mock_lambda_client):
    """Test handling when some refreshes succeed and others fail"""

    # First call succeeds, second fails, third succeeds
    mock_lambda_client.invoke.side_effect = [
        {'StatusCode': 202, 'Payload': MagicMock()},
        Exception('Failed'),
        {'StatusCode': 202, 'Payload': MagicMock()}
    ]

    from app import lambda_handler

    event = {}
    context = MagicMock()

    result = lambda_handler(event, context)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['successful_updates'] == 2
    assert body['failed_updates'] == 1


@mock_aws
@patch('app.lambda_client')
@patch('urllib.request.urlopen')
def test_scheduled_weather_cloudformation_event(mock_urlopen, mock_lambda_client):
    """Test handling of CloudFormation custom resource event"""

    mock_lambda_client.invoke.return_value = {
        'StatusCode': 202,
        'Payload': MagicMock()
    }

    mock_response = MagicMock()
    mock_response.status = 200
    mock_urlopen.return_value = mock_response

    from app import lambda_handler

    event = {
        'RequestType': 'Create',
        'ResponseURL': 'https://cloudformation-response.example.com',
        'StackId': 'test-stack',
        'RequestId': 'test-request',
        'LogicalResourceId': 'TestResource'
    }
    context = MagicMock()
    context.log_stream_name = 'test-log-stream'

    result = lambda_handler(event, context)

    assert result == 'SUCCESS'
    assert mock_urlopen.called


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_empty_cities_list(mock_lambda_client):
    """Test handling when DEFAULT_CITIES is empty"""

    old_cities = os.environ.get('DEFAULT_CITIES')
    os.environ['DEFAULT_CITIES'] = ''

    from app import lambda_handler

    event = {}
    context = MagicMock()

    result = lambda_handler(event, context)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['total_processed'] == 0

    # Restore cities
    if old_cities:
        os.environ['DEFAULT_CITIES'] = old_cities


@mock_aws
@patch('app.lambda_client')
def test_scheduled_weather_malformed_cities(mock_lambda_client):
    """Test handling of malformed city entries"""

    old_cities = os.environ.get('DEFAULT_CITIES')
    os.environ['DEFAULT_CITIES'] = 'Paris,FR|InvalidEntry|London,GB'

    mock_lambda_client.invoke.return_value = {
        'StatusCode': 202,
        'Payload': MagicMock()
    }

    from app import lambda_handler

    event = {}
    context = MagicMock()

    result = lambda_handler(event, context)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    # Should only process valid entries (Paris and London)
    assert body['total_processed'] == 2

    # Restore cities
    if old_cities:
        os.environ['DEFAULT_CITIES'] = old_cities
import json
import boto3
import pytest
from moto import mock_aws
import os
import sys
import time

# Set environment variables BEFORE any imports
os.environ['AWS_DEFAULT_REGION'] = 'eu-north-1'
os.environ['CONNECTIONS_TABLE'] = 'test-connections'
os.environ['WEBSOCKET_API_ENDPOINT'] = 'test-endpoint.execute-api.eu-north-1.amazonaws.com'
os.environ['DEBUG_MODE'] = 'true'


@pytest.fixture
def dynamodb_table():
    """Create a mock DynamoDB table for testing"""
    with mock_aws():
        dynamodb_resource = boto3.resource('dynamodb', region_name='eu-north-1')
        table = dynamodb_resource.create_table(
            TableName='test-connections',
            KeySchema=[{'AttributeName': 'connectionId', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'connectionId', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        yield table


@mock_aws
def test_connect_success(dynamodb_table):
    """Test successful WebSocket connection"""

    sys.path.insert(0, '.aws-sam/build/ConnectFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-connection-123',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        }
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    assert 'Connected successfully' in result['body']

    response = dynamodb_table.get_item(Key={'connectionId': 'test-connection-123'})
    assert 'Item' in response
    assert response['Item']['connectionId'] == 'test-connection-123'
    assert 'timestamp' in response['Item']
    assert 'ttl' in response['Item']


@mock_aws
def test_connect_stores_ttl(dynamodb_table):
    """Test that connection stores TTL correctly (2 hours from now)"""

    sys.path.insert(0, '.aws-sam/build/ConnectFunction')
    from app import lambda_handler

    current_time = int(time.time())

    event = {
        'requestContext': {
            'connectionId': 'test-connection-456',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        }
    }

    result = lambda_handler(event, None)

    response = dynamodb_table.get_item(Key={'connectionId': 'test-connection-456'})
    stored_ttl = int(response['Item']['ttl'])
    expected_ttl = current_time + 7200

    assert abs(stored_ttl - expected_ttl) < 5


@mock_aws
def test_connect_with_api_gateway_error(dynamodb_table):
    """Test connection succeeds even if welcome message fails"""

    sys.path.insert(0, '.aws-sam/build/ConnectFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-connection-789',
            'domainName': 'invalid-endpoint',
            'stage': 'Prod'
        }
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200

    response = dynamodb_table.get_item(Key={'connectionId': 'test-connection-789'})
    assert 'Item' in response


@mock_aws
def test_connect_multiple_connections(dynamodb_table):
    """Test handling multiple connections"""

    sys.path.insert(0, '.aws-sam/build/ConnectFunction')
    from app import lambda_handler

    connection_ids = ['conn-1', 'conn-2', 'conn-3']

    for conn_id in connection_ids:
        event = {
            'requestContext': {
                'connectionId': conn_id,
                'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
                'stage': 'Prod'
            }
        }
        result = lambda_handler(event, None)
        assert result['statusCode'] == 200

    for conn_id in connection_ids:
        response = dynamodb_table.get_item(Key={'connectionId': conn_id})
        assert 'Item' in response
        assert response['Item']['connectionId'] == conn_id


@mock_aws
def test_connect_error_handling():
    """Test error handling when DynamoDB is unavailable"""

    sys.path.insert(0, '.aws-sam/build/ConnectFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-connection-error',
            'domainName': 'test-endpoint.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        }
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 500
    body = json.loads(result['body'])
    assert 'Failed to connect' in body
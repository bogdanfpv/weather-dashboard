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
def test_disconnect_success(dynamodb_table):
    """Test successful WebSocket disconnection"""

    dynamodb_table.put_item(
        Item={
            'connectionId': 'test-connection-123',
            'timestamp': int(time.time()),
            'ttl': int(time.time()) + 7200
        }
    )

    response = dynamodb_table.get_item(Key={'connectionId': 'test-connection-123'})
    assert 'Item' in response

    sys.path.insert(0, '.aws-sam/build/DisconnectFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-connection-123'
        }
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    assert 'Disconnected successfully' in result['body']

    # Verify connection was removed
    response = dynamodb_table.get_item(Key={'connectionId': 'test-connection-123'})
    assert 'Item' not in response


@mock_aws
def test_disconnect_nonexistent_connection(dynamodb_table):
    """Test disconnecting a connection that doesn't exist"""

    sys.path.insert(0, '.aws-sam/build/DisconnectFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'nonexistent-connection'
        }
    }

    result = lambda_handler(event, None)

    # Should still return success (idempotent operation)
    assert result['statusCode'] == 200


@mock_aws
def test_disconnect_multiple_connections(dynamodb_table):
    """Test disconnecting multiple connections"""

    connection_ids = ['conn-1', 'conn-2', 'conn-3']

    for conn_id in connection_ids:
        dynamodb_table.put_item(
            Item={
                'connectionId': conn_id,
                'timestamp': int(time.time()),
                'ttl': int(time.time()) + 7200
            }
        )

    sys.path.insert(0, '.aws-sam/build/DisconnectFunction')
    from app import lambda_handler

    # Disconnect all connections
    for conn_id in connection_ids:
        event = {
            'requestContext': {
                'connectionId': conn_id
            }
        }
        result = lambda_handler(event, None)
        assert result['statusCode'] == 200

    # Verify all connections are removed
    for conn_id in connection_ids:
        response = dynamodb_table.get_item(Key={'connectionId': conn_id})
        assert 'Item' not in response


@mock_aws
def test_disconnect_error_handling():
    """Test error handling when DynamoDB is unavailable"""

    sys.path.insert(0, '.aws-sam/build/DisconnectFunction')
    from app import lambda_handler

    event = {
        'requestContext': {
            'connectionId': 'test-connection-error'
        }
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 500
    body = json.loads(result['body'])
    assert 'Failed to disconnect' in body
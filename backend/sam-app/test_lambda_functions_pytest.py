import json
import boto3
import pytest
from moto import mock_dynamodb, mock_apigatewaymanagementapi
import os
import sys

# Set environment variables
os.environ['CONNECTIONS_TABLE'] = 'test-connections'
os.environ['WEBSOCKET_API_ENDPOINT'] = 'test-endpoint.execute-api.eu-north-1.amazonaws.com'

@pytest.fixture
def dynamodb_table():
    """Create a mock DynamoDB table for testing"""
    with mock_dynamodb():
        dynamodb_resource = boto3.resource('dynamodb', region_name='eu-north-1')
        table = dynamodb_resource.create_table(
            TableName='test-connections',
            KeySchema=[{'AttributeName': 'connectionId', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'connectionId', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        yield table

def test_connect_function(dynamodb_table):
    """Test connect function with mocked DynamoDB"""

    # Import function
    sys.path.append('.aws-sam/build/ConnectFunction')
    from app import lambda_handler

    # Test event
    event = {
        'requestContext': {
            'connectionId': 'test-connection-12345',
            'domainName': 'test-api.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        }
    }

    # Test
    result = lambda_handler(event, None)

    # Verify
    assert result['statusCode'] == 200
    response = dynamodb_table.get_item(Key={'connectionId': 'test-connection-12345'})
    assert 'Item' in response

def test_disconnect_function(dynamodb_table):
    """Test disconnect function"""

    # Add a connection first
    dynamodb_table.put_item(Item={'connectionId': 'test-connection-12345'})

    # Import function
    sys.path.append('.aws-sam/build/DisconnectFunction')
    from app import lambda_handler

    # Test event
    event = {
        'requestContext': {
            'connectionId': 'test-connection-12345',
            'domainName': 'test-api.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        }
    }

    # Test
    result = lambda_handler(event, None)

    # Verify function runs successfully
    assert result['statusCode'] == 200

@mock_apigatewaymanagementapi
def test_broadcast_function(dynamodb_table):
    """Test broadcast function"""

    # Add some connections
    dynamodb_table.put_item(Item={'connectionId': 'connection-1'})
    dynamodb_table.put_item(Item={'connectionId': 'connection-2'})

    # Import function
    try:
        sys.path.append('.aws-sam/build/BroadcastFunction')
        from app import lambda_handler
    except ImportError:
        pytest.skip("Broadcast function not found")

    # Test event
    event = {
        'message': 'Test broadcast message',
        'type': 'notification',
        'requestContext': {
            'connectionId': 'broadcast-sender',
            'domainName': 'test-api.execute-api.eu-north-1.amazonaws.com',
            'stage': 'Prod'
        }
    }

    # Test
    result = lambda_handler(event, None)

    # Verify
    assert result['statusCode'] == 200
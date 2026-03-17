import json
import boto3
import pytest
from moto import mock_aws
import os
import sys
from decimal import Decimal

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
def test_broadcast_with_connections(dynamodb_table):
    """Test broadcast function with active connections"""

    # Add some test connections
    dynamodb_table.put_item(Item={'connectionId': 'connection-1'})
    dynamodb_table.put_item(Item={'connectionId': 'connection-2'})
    dynamodb_table.put_item(Item={'connectionId': 'connection-3'})

    # Import function inside the test after mock is active
    sys.path.insert(0, '.aws-sam/build/BroadcastFunction')
    from app import lambda_handler

    # Test event
    event = {
        'message': 'Test broadcast message',
        'type': 'notification'
    }

    # Execute
    result = lambda_handler(event, None)

    # Verify
    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['total_connections'] == 3
    assert 'successful_sends' in body
    assert 'failed_sends' in body


@mock_aws
def test_broadcast_no_connections(dynamodb_table):
    """Test broadcast function with no active connections"""

    # Import function
    sys.path.insert(0, '.aws-sam/build/BroadcastFunction')
    from app import lambda_handler

    # Test event
    event = {
        'message': 'Test message',
        'type': 'alert'
    }

    # Execute
    result = lambda_handler(event, None)

    # Verify
    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body == 'No active connections'


@mock_aws
def test_broadcast_with_sns_event(dynamodb_table):
    """Test broadcast triggered by SNS/SQS"""

    # Add connection
    dynamodb_table.put_item(Item={'connectionId': 'connection-1'})

    # Import function
    sys.path.insert(0, '.aws-sam/build/BroadcastFunction')
    from app import lambda_handler

    # SNS/SQS event format
    event = {
        'Records': [
            {
                'body': json.dumps({
                    'message': 'SNS triggered message',
                    'type': 'system'
                })
            }
        ]
    }

    # Execute
    result = lambda_handler(event, None)

    # Verify
    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['total_connections'] == 1


@mock_aws
def test_broadcast_default_message_type(dynamodb_table):
    """Test broadcast with default message type"""

    # Add connection
    dynamodb_table.put_item(Item={'connectionId': 'connection-1'})

    # Import function
    sys.path.insert(0, '.aws-sam/build/BroadcastFunction')
    from app import lambda_handler

    # Event without type specified
    event = {
        'message': 'Message without type'
    }

    # Execute
    result = lambda_handler(event, None)

    # Verify
    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['total_connections'] == 1


@mock_aws
def test_broadcast_error_handling():
    """Test broadcast function error handling"""

    # Don't set up DynamoDB table to trigger error

    # Import function
    sys.path.insert(0, '.aws-sam/build/BroadcastFunction')
    from app import lambda_handler

    # Test event
    event = {
        'message': 'Test message'
    }

    # Execute
    result = lambda_handler(event, None)

    # Verify error response
    assert result['statusCode'] == 500
    assert 'Broadcast failed' in result['body']
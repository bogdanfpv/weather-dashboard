import pytest
import boto3
import os
import sys
from moto import mock_aws

# Set environment variables for all tests
os.environ['AWS_DEFAULT_REGION'] = 'eu-north-1'
os.environ['CONNECTIONS_TABLE'] = 'test-connections'
os.environ['WEBSOCKET_API_ENDPOINT'] = 'test-endpoint.execute-api.eu-north-1.amazonaws.com'
os.environ['DEBUG_MODE'] = 'true'
os.environ['RATE_LIMIT_TABLE'] = 'test-rate-limit'


@pytest.fixture
def dynamodb_table():
    """Create a mock DynamoDB connections table for testing"""
    with mock_aws():
        dynamodb_resource = boto3.resource('dynamodb', region_name='eu-north-1')
        table = dynamodb_resource.create_table(
            TableName='test-connections',
            KeySchema=[{'AttributeName': 'connectionId', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'connectionId', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        yield table


@pytest.fixture
def rate_limit_table():
    """Create a mock DynamoDB rate limit table for testing"""
    with mock_aws():
        dynamodb_resource = boto3.resource('dynamodb', region_name='eu-north-1')
        table = dynamodb_resource.create_table(
            TableName='test-rate-limit',
            KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        yield table


@pytest.fixture(autouse=True)
def clear_app_module():
    """Clear the 'app' module from sys.modules before each test to prevent caching"""
    # Remove before test
    sys.modules.pop('app', None)
    # Also clear sys.path modifications
    original_path = sys.path.copy()

    yield

    # Cleanup after test
    sys.modules.pop('app', None)
    sys.path[:] = original_path
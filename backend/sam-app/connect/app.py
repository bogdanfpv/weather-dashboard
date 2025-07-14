import json
import boto3
import os
import time
from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)  # Convert Decimal to float
        return super(DecimalEncoder, self).default(obj)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
DEBUG_MODE = os.environ.get('DEBUG_MODE', 'false').lower() == 'true'

def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']

    try:
        # Store connection with TTL
        table.put_item(
            Item={
                'connectionId': connection_id,
                'timestamp': int(time.time()),
                'ttl': int(time.time()) + 7200
            }
        )

        # Don't fail the connection if sending welcome message fails
        try:
            # Send a test message to the new connection
            endpoint = f"https://{event['requestContext']['domainName']}/{event['requestContext']['stage']}"
            apigw_client = boto3.client('apigatewaymanagementapi', endpoint_url=endpoint)
            apigw_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps({
                    'type': 'test',
                    'message': 'Welcome! This is a test message.',
                    'timestamp': int(time.time())
                }, cls=DecimalEncoder)
            )
        except Exception as msg_error:
            # Log but don't fail the connection
            print(f"Welcome message failed: {str(msg_error)}")

        return {
            'statusCode': 200,
            'body': json.dumps('Connected successfully', cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error storing connection {connection_id}: {str(e)}")
        error_message = 'Failed to connect'
        if DEBUG_MODE:
            error_message += f': {str(e)}'

        return {
            'statusCode': 500,
            'body': json.dumps(error_message, cls=DecimalEncoder)
        }
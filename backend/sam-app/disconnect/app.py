import json
import boto3
import os
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
    """
    Handle WebSocket disconnection
    Remove the connection ID from DynamoDB
    """
    connection_id = event['requestContext']['connectionId']

    try:
        # Remove connection from table
        table.delete_item(
            Key={
                'connectionId': connection_id
            }
        )

        print(f"Connection {connection_id} removed successfully")

        return {
            'statusCode': 200,
            'body': json.dumps('Disconnected successfully', cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error removing connection {connection_id}: {str(e)}")
        error_message = 'Failed to disconnect'
        if DEBUG_MODE:
            error_message += f': {str(e)}'

        return {
            'statusCode': 500,
            'body': json.dumps(error_message, cls=DecimalEncoder)
        }
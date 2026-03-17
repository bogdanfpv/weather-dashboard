import json
import boto3
import os
import time
from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
DEBUG_MODE = os.environ.get('DEBUG_MODE', 'false').lower() == 'true'

def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']

    try:
        table.put_item(
            Item={
                'connectionId': connection_id,
                'timestamp': int(time.time()),
                'ttl': int(time.time()) + 7200
            }
        )

        print(f"Connection {connection_id} stored successfully")

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
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
    """
    Broadcast function that can be triggered by other AWS services
    Use this to send notifications to all connected WebSocket clients

    Expected event format:
    {
        "message": "Your notification message",
        "type": "notification" // optional
    }
    """

    try:
        if 'Records' in event:
            message_data = json.loads(event['Records'][0]['body'])
        else:
            message_data = event

        message = message_data.get('message', 'No message provided')
        message_type = message_data.get('type', 'notification')

        websocket_endpoint = os.environ['WEBSOCKET_API_ENDPOINT']
        apigw_client = boto3.client('apigatewaymanagementapi',
                                   endpoint_url=f"https://{websocket_endpoint}")
        response = table.scan()
        connections = response.get('Items', [])

        if not connections:
            print("No active connections to broadcast to")
            return {
                'statusCode': 200,
                'body': json.dumps('No active connections', cls=DecimalEncoder)
            }

        broadcast_data = {
            'type': message_type,
            'message': message,
            'timestamp': int(time.time())
        }

        successful_sends = 0
        failed_sends = 0

        for connection in connections:
            connection_id = connection['connectionId']
            try:
                apigw_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=json.dumps(broadcast_data, cls=DecimalEncoder)
                )
                successful_sends += 1

            except apigw_client.exceptions.GoneException:
                print(f"Removing stale connection: {connection_id}")
                table.delete_item(Key={'connectionId': connection_id})
                failed_sends += 1

            except Exception as e:
                print(f"Error sending to {connection_id}: {str(e)}")
                failed_sends += 1

        result = {
            'successful_sends': successful_sends,
            'failed_sends': failed_sends,
            'total_connections': len(connections)
        }

        print(f"Broadcast complete: {json.dumps(result, cls=DecimalEncoder)}")

        return {
            'statusCode': 200,
            'body': json.dumps(result, cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error in broadcast function: {str(e)}")
        error_message = 'Broadcast failed'
        if DEBUG_MODE:
            error_message += f': {str(e)}'

        return {
            'statusCode': 500,
            'body': json.dumps(error_message, cls=DecimalEncoder)
        }
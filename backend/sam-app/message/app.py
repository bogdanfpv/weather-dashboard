import json
import boto3
import os
import time

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])

# API Gateway Management API client for sending messages back to WebSocket clients
def get_apigw_client(event):
    endpoint = f"https://{event['requestContext']['domainName']}/{event['requestContext']['stage']}"
    return boto3.client('apigatewaymanagementapi', endpoint_url=endpoint)

def lambda_handler(event, context):
    """
    Handle incoming WebSocket messages
    Echo the message back to the sender, or broadcast to all connections
    """
    connection_id = event['requestContext']['connectionId']

    try:
        # Parse the incoming message
        body = json.loads(event.get('body', '{}'))
        message_type = body.get('action', 'echo')
        message_data = body.get('data', 'Hello from WebSocket!')

        apigw_client = get_apigw_client(event)

        if message_type == 'broadcast':
            # Send message to all connected clients
            return broadcast_message(apigw_client, message_data, connection_id)
        else:
            # Echo message back to sender
            return echo_message(apigw_client, connection_id, message_data)

    except Exception as e:
        print(f"Error handling message from {connection_id}: {str(e)}")

        return {
            'statusCode': 500,
            'body': json.dumps('Failed to handle message')
        }

def echo_message(apigw_client, connection_id, message):
    """Send message back to the sender"""
    try:
        response_data = {
            'type': 'echo',
            'message': message,
            'timestamp': int(time.time())
        }

        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(response_data)
        )

        return {
            'statusCode': 200,
            'body': json.dumps('Message echoed successfully')
        }

    except Exception as e:
        print(f"Error echoing message to {connection_id}: {str(e)}")
        raise

def broadcast_message(apigw_client, message, sender_id):
    """Send message to all connected clients"""
    try:
        # Get all connections from DynamoDB
        response = table.scan()
        connections = response.get('Items', [])

        broadcast_data = {
            'type': 'broadcast',
            'message': message,
            'from': sender_id,
            'timestamp': int(time.time())
        }

        # Send to all connections
        for connection in connections:
            connection_id = connection['connectionId']
            try:
                apigw_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=json.dumps(broadcast_data)
                )
            except apigw_client.exceptions.GoneException:
                # Connection is stale, remove it
                print(f"Removing stale connection: {connection_id}")
                table.delete_item(Key={'connectionId': connection_id})

        return {
            'statusCode': 200,
            'body': json.dumps(f'Message broadcast to {len(connections)} connections')
        }

    except Exception as e:
        print(f"Error broadcasting message: {str(e)}")
        raise
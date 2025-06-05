import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])

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
            'body': json.dumps('Disconnected successfully')
        }

    except Exception as e:
        print(f"Error removing connection {connection_id}: {str(e)}")

        return {
            'statusCode': 500,
            'body': json.dumps('Failed to disconnect')
        }
import json
import boto3
import logging
import secrets
import os
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])

RATE_LIMIT_TABLE = os.environ['RATE_LIMIT_TABLE']
rate_limit_table = dynamodb.Table(RATE_LIMIT_TABLE)
RATE_LIMIT_MINUTES = int(os.environ.get('RATE_LIMIT_MINUTES', '1'))

cities_env = os.environ.get('DEFAULT_CITIES', '')

def lambda_handler(event, context):
    logger.info(f"Event received: {json.dumps(event)}")

    try:
        if event.get('RequestType'):
            initialize_tables()
            logger.info("Initialization completed successfully")
            send_response(event, context, "SUCCESS", {"Message": "Initialization complete"})
            return
        if event.get('action') == 'refresh_token':
            location_key = event.get('location_key')
            if location_key:
                refresh_location_token(location_key, event)
                logger.info(f"Token refreshed for location: {location_key}")
                return {
                    'statusCode': 200,
                    'body': json.dumps(f'Token refreshed for {location_key}')
                }
            else:
                raise ValueError("location_key is required for refresh_token action")

    except Exception as e:
        logger.error(f"Error in lambda_handler: {str(e)}")
        if 'RequestType' in event:
            send_response(event, context, "FAILED", {"Message": str(e)})
        else:
            raise

def initialize_tables():
    """Initialize tokens for all default cities"""
    cities_env = os.environ.get('DEFAULT_CITIES', '')
    if not cities_env:
        logger.warning("No DEFAULT_CITIES configured")
        return

    for city_country in cities_env.split('|'):
        city_country = city_country.strip()
        if city_country:
            parts = city_country.split(',')
            if len(parts) == 2:
                city, country = parts
                location_key = get_location_key(city, country)
                generate_and_store_token(location_key, can_update=True)
                logger.info(f"Initialized token for {location_key}")

def refresh_location_token(location_key, event=None):
    """Refresh token for a specific location and broadcast availability"""
    token, token_timestamp = generate_and_store_token(location_key, can_update=True)
    logger.info(f"Token refreshed and can_update set to True for {location_key}")

    try:
        websocket_endpoint = os.environ.get('WEBSOCKET_API_ENDPOINT')
        if websocket_endpoint:
            apigw_client = boto3.client('apigatewaymanagementapi',
                                      endpoint_url=f"https://{websocket_endpoint}")

            parts = location_key.split('_')
            if len(parts) >= 2:
                city = parts[0].title()
                country = parts[1].upper()

                availability_data = {
                    'type': 'token_available',
                    'city': city,
                    'country': country,
                    'location': f"{city}, {country}",
                    'timestamp': token_timestamp
                }

                response = table.scan()
                connections = response.get('Items', [])

                for connection in connections:
                    try:
                        apigw_client.post_to_connection(
                            ConnectionId=connection['connectionId'],
                            Data=json.dumps(availability_data)
                        )
                    except Exception as e:
                        logger.warning(f"Failed to notify connection: {str(e)}")

    except Exception as e:
        logger.warning(f"Failed to broadcast token availability: {str(e)}")

def generate_and_store_token(location_key, can_update=True):
    """Generate a new token and store it in DynamoDB and Redis"""
    token = secrets.token_urlsafe(32)
    current_time = datetime.now().isoformat()

    rate_limit_table.put_item(Item={
        'id': f'token_{location_key}',
        'token': token,
        'timestamp': current_time,
        'location': location_key,
        'can_update': can_update
    })
    update_redis(current_time, location_key, token, can_update)

    return token, current_time

def update_redis(timestamp, location_key, token, can_update):
    """Update Redis with token information"""
    try:
        redis_url = os.environ.get('UPSTASH_REDIS_REST_URL')
        redis_token = os.environ.get('UPSTASH_REDIS_REST_TOKEN')

        if not redis_url or not redis_token:
            logger.warning("Redis credentials not configured, skipping Redis update")
            return False

        token_data = {
            "timestamp": timestamp,
            "token": token,
            "can_update": can_update,
            "location": location_key
        }
        payload = json.dumps(["SET", f"token_{location_key}", json.dumps(token_data)])

        req = Request(
            redis_url,
            data=payload.encode('utf-8'),
            headers={
                "Authorization": f"Bearer {redis_token}",
                "Content-Type": "application/json"
            },
            method='POST'
        )

        response = urlopen(req, timeout=10)

        if response.status == 200:
            logger.info(f"Successfully updated Redis with token for {location_key}")
            return True
        else:
            logger.error(f"Failed to update Redis for {location_key}")
            return False

    except Exception as e:
        logger.error(f"Error updating Redis for {location_key}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def get_location_key(city, country):
    """Generate a consistent key for location-based storage"""
    return f"{city.lower()}_{country.lower()}"

def send_response(event, context, response_status, response_data):
    """Send response to CloudFormation"""
    response_url = event['ResponseURL']

    response_body = {
        'Status': response_status,
        'Reason': f'See CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': context.log_stream_name,
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': response_data
    }

    json_response_body = json.dumps(response_body)

    headers = {
        'content-type': '',
        'content-length': str(len(json_response_body))
    }

    try:
        req = Request(response_url, data=json_response_body.encode('utf-8'), headers=headers, method='PUT')
        response = urlopen(req)
        logger.info(f"Status code: {response.getcode()}")
    except Exception as e:
        logger.error(f"send_response failed: {str(e)}")
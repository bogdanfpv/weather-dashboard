import json
import boto3
import os
import time
import requests
from datetime import datetime, timedelta
from decimal import Decimal
from urllib.parse import quote
from botocore.exceptions import ClientError
import logging

scheduler = boto3.client('scheduler')
logger = logging.getLogger()
logger.setLevel(logging.INFO)

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
DEBUG_MODE = os.environ.get('DEBUG_MODE', 'false').lower() == 'true'

RATE_LIMIT_TABLE = os.environ.get('RATE_LIMIT_TABLE', 'WeatherRateLimit')
rate_limit_table = dynamodb.Table(RATE_LIMIT_TABLE)
RATE_LIMIT_MINUTES = int(os.environ.get('RATE_LIMIT_MINUTES'))

lambda_client = boto3.client('lambda')
TOKEN_FUNCTION_NAME = os.environ.get('TOKEN_FUNCTION_NAME')

OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY')
if not OPENWEATHER_API_KEY:
    raise RuntimeError('OPENWEATHER_API_KEY environment variable is not set')

def get_apigw_client(event):
    endpoint = f"https://{event['requestContext']['domainName']}/{event['requestContext']['stage']}"
    return boto3.client('apigatewaymanagementapi', endpoint_url=endpoint)

def get_location_key(city, country):
    """Generate a consistent key for location-based storage"""
    return f"{city.lower()}_{country.lower()}"

def schedule_token_refresh(location_key):
    try:
        schedule_time = datetime.now() + timedelta(minutes=RATE_LIMIT_MINUTES)
        schedule_name = f'token-refresh-{location_key}-{int(time.time())}'

        TOKEN_FUNCTION_ARN = os.environ.get('TOKEN_FUNCTION_ARN')
        SCHEDULER_ROLE_ARN = os.environ.get('SCHEDULER_ROLE_ARN')

        if not TOKEN_FUNCTION_ARN or not SCHEDULER_ROLE_ARN:
            print("TOKEN_FUNCTION_ARN or SCHEDULER_ROLE_ARN not configured, skipping scheduled refresh")
            return False

        scheduler.create_schedule(
            Name=schedule_name,
            ScheduleExpression=f'at({schedule_time.strftime("%Y-%m-%dT%H:%M:%S")})',
            Target={
                'Arn': TOKEN_FUNCTION_ARN,
                'RoleArn': SCHEDULER_ROLE_ARN,
                'Input': json.dumps({
                    'action': 'refresh_token',
                    'location_key': location_key
                })
            },
            FlexibleTimeWindow={'Mode': 'OFF'}
        )
        print(f"Scheduled token refresh for {location_key} at {schedule_time}")
        return True

    except Exception as e:
        print(f"Error scheduling token refresh: {str(e)}")
        return False

def broadcast_to_all_connections(apigw_client, data):
    """Broadcast data to all connected clients"""
    try:
        response = table.scan()
        connections = response.get('Items', [])

        for connection in connections:
            connection_id = connection['connectionId']
            try:
                apigw_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=json.dumps(data, cls=DecimalEncoder)
                )
            except apigw_client.exceptions.GoneException:
                # Remove stale connection
                table.delete_item(Key={'connectionId': connection_id})
                logger.info(f"Removed stale connection: {connection_id}")
            except Exception as e:
                logger.warning(f"Failed to send to {connection_id}: {str(e)}")

    except Exception as e:
        logger.error(f"Error broadcasting: {str(e)}")

def fetch_weather_data(city="Paris", country="FR"):
    """Fetch weather data from OpenWeatherMap API"""
    try:
        current_url = f"http://api.openweathermap.org/data/2.5/weather?q={city},{country}&appid={OPENWEATHER_API_KEY}&units=metric"
        current_response = requests.get(current_url, timeout=10)
        current_data = current_response.json()

        if current_response.status_code != 200:
            raise Exception(f"OpenWeatherMap API error: {current_data.get('message', 'Unknown error')}")

        forecast_url = f"http://api.openweathermap.org/data/2.5/forecast?q={city},{country}&appid={OPENWEATHER_API_KEY}&units=metric"
        forecast_response = requests.get(forecast_url, timeout=10)
        forecast_data = forecast_response.json()

        uv_url = f"http://api.openweathermap.org/data/2.5/uvi?lat={current_data['coord']['lat']}&lon={current_data['coord']['lon']}&appid={OPENWEATHER_API_KEY}"
        uv_response = requests.get(uv_url, timeout=10)
        uv_data = uv_response.json()

        weather_update = {
            "location": f"{current_data['name']}, {current_data['sys']['country']}",
            "date": datetime.now().strftime("%A %d %B"),
            "current": {
                "temp": round(current_data['main']['temp']),
                "condition": current_data['weather'][0]['description'].title(),
                "high": round(current_data['main']['temp_max']),
                "low": round(current_data['main']['temp_min']),
                "wind": f"{round(current_data['wind']['speed'])}km/h",
                "sky": f"{current_data['weather'][0]['main']}",
                "sunrise": datetime.fromtimestamp(current_data['sys']['sunrise']).strftime("%H:%M"),
                "sunset": datetime.fromtimestamp(current_data['sys']['sunset']).strftime("%H:%M"),
                "visibility": f"{current_data.get('visibility', 10000) / 1000}km",
                "humidity": f"{current_data['main']['humidity']}%",
                "pressure": f"{current_data['main']['pressure']}mb",
                "uvIndex": f"{uv_data['value'] if 'value' in uv_data else 'N/A'}",
            },
            "hourly": [],
            "daily": []
        }

        for item in forecast_data['list'][:7]:
            hour_data = {
                "time": datetime.fromtimestamp(item['dt']).strftime("%I%p").lower(),
                "temp": round(item['main']['temp']),
                "icon": map_weather_icon(item['weather'][0]['main'])
            }
            weather_update["hourly"].append(hour_data)

        daily_data = {}
        for item in forecast_data['list']:
            date = datetime.fromtimestamp(item['dt']).date()
            if date not in daily_data:
                daily_data[date] = {
                    "temps": [],
                    "conditions": [],
                    "winds": []
                }
            daily_data[date]["temps"].append(item['main']['temp'])
            daily_data[date]["conditions"].append(item['weather'][0]['main'])
            daily_data[date]["winds"].append(item['wind']['speed'])

        for date, data in list(daily_data.items())[:5]:
            day_data = {
                "day": date.strftime("%a"),
                "date": date.strftime("%d/%m"),
                "low": round(min(data["temps"])),
                "high": round(max(data["temps"])),
                "wind": f"{round(max(data['winds']) * 3.6)}mph",
                "icon": map_weather_icon(max(set(data["conditions"]), key=data["conditions"].count))
            }
            weather_update["daily"].append(day_data)

        return weather_update

    except Exception as e:
        print(f"Error fetching weather data: {str(e)}")
        raise

def map_weather_icon(condition):
    """Map OpenWeatherMap conditions to your icon system"""
    condition_map = {
        "Clear": "clear",
        "Clouds": "cloudy",
        "Rain": "rain",
        "Drizzle": "rain",
        "Thunderstorm": "rain",
        "Snow": "snow",
        "Mist": "cloudy",
        "Fog": "cloudy"
    }
    return condition_map.get(condition, "clear")

def lambda_handler(event, context):
    """Handle incoming WebSocket messages"""
    connection_id = event['requestContext']['connectionId']

    try:
        body = json.loads(event.get('body', '{}'))
        message_type = body.get('action', 'echo')
        message_data = body.get('data', 'Hello from WebSocket!')
        client_id = body.get('clientId')

        apigw_client = get_apigw_client(event)

        if message_type == 'get_weather':
            city = body.get('city')
            country = body.get('country')
            token = body.get('token')
            request_token = body.get('requestToken', False)

            if not city or not country:
                        error_data = {
                            'type': 'weather_error',
                            'message': 'City and country are required for weather requests',
                            'timestamp': int(time.time()),
                            'location': f"{city or 'N/A'}, {country or 'N/A'}"
                        }
                        apigw_client.post_to_connection(
                            ConnectionId=connection_id,
                            Data=json.dumps(error_data, cls=DecimalEncoder)
                        )
                        return {
                            'statusCode': 400,
                            'body': json.dumps('City and country required', cls=DecimalEncoder)
                        }

                    # If requestToken is true, get token from DynamoDB instead of requiring it
                    if request_token and not token:
                            location_key = get_location_key(city, country)
                            try:
                                response = rate_limit_table.get_item(Key={'id': f'token_{location_key}'})
                                if 'Item' in response:
                                    item = response['Item']
                                    if item.get('can_update', False):
                                        token = item.get('token')
                                    else:
                                        # Rate limited - token exists but can't be used
                                        denial_data = {
                                            'type': 'weather_request_denied',
                                            'message': f'Rate limit active for {city}, {country}',
                                            'timestamp': int(time.time()),
                                            'location': f"{city}, {country}",
                                            'city': city,
                                            'country': country,
                                            'clientId': client_id
                                        }
                                        apigw_client.post_to_connection(
                                            ConnectionId=connection_id,
                                            Data=json.dumps(denial_data, cls=DecimalEncoder)
                                        )
                                        return {
                                            'statusCode': 429,
                                            'body': json.dumps('Rate limited', cls=DecimalEncoder)
                                        }
                                else:
                                    # No token record exists for this location
                                    denial_data = {
                                        'type': 'weather_request_denied',
                                        'message': f'No token available for {city}, {country}',
                                        'timestamp': int(time.time()),
                                        'location': f"{city}, {country}",
                                        'city': city,
                                        'country': country,
                                        'clientId': client_id
                                    }
                                    apigw_client.post_to_connection(
                                        ConnectionId=connection_id,
                                        Data=json.dumps(denial_data, cls=DecimalEncoder)
                                    )
                                    return {
                                        'statusCode': 403,
                                        'body': json.dumps('No token available', cls=DecimalEncoder)
                                    }

                            except Exception as e:
                                logger.error(f"Error getting token from DynamoDB: {str(e)}")
                                return {
                                    'statusCode': 500,
                                    'body': json.dumps('Token retrieval failed', cls=DecimalEncoder)
                                }

                        # Now validate that we have a token before proceeding
                        if not token:
                            error_data = {
                                'type': 'weather_error',
                                'message': 'Token is required for weather requests',
                                'timestamp': int(time.time()),
                                'location': f"{city}, {country}"
                            }
                            apigw_client.post_to_connection(
                                ConnectionId=connection_id,
                                Data=json.dumps(error_data, cls=DecimalEncoder)
                            )
                            return {
                                'statusCode': 400,
                                'body': json.dumps('Token required', cls=DecimalEncoder)
                            }

                        return handle_weather_request(apigw_client, connection_id, city, country, token, client_id)

        elif message_type == 'broadcast':
            return broadcast_message(apigw_client, message_data, connection_id)
        else:
            return echo_message(apigw_client, connection_id, message_data)

    except Exception as e:
        print(f"Error handling message from {connection_id}: {str(e)}")
        error_message = 'Failed to handle message'
        if DEBUG_MODE:
            error_message += f': {str(e)}'

        return {
            'statusCode': 500,
            'body': json.dumps(error_message, cls=DecimalEncoder)
        }

def handle_weather_request(apigw_client, connection_id, city, country, token, client_id):
    """Handle weather data request with token validation"""
    try:
        location_key = get_location_key(city, country)

        if not token:
            # Send error back to worker, not directly to client
            error_data = {
                'type': 'weather_error',
                'message': 'No token available for weather requests',
                'timestamp': int(time.time()),
                'location': f"{city}, {country}",
                'clientId': client_id  # Worker needs this to route to correct client
            }
            apigw_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(error_data, cls=DecimalEncoder)
            )
            return {
                'statusCode': 400,
                'body': json.dumps('No token available', cls=DecimalEncoder)
            }

        # Validate and consume token atomically
        is_valid, message = validate_and_consume_token(location_key, token)

        if not is_valid:
            # Send denial back to worker
            denial_data = {
                'type': 'weather_request_denied',
                'message': f'Weather update request denied for {city}, {country}. {message}',
                'timestamp': int(time.time()),
                'location': f"{city}, {country}",
                'city': city,
                'country': country,
                'clientId': client_id  # Worker needs this for routing
            }
            apigw_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(denial_data, cls=DecimalEncoder)
            )

            # Immediately update Redis to reflect consumed token
            update_redis_can_update(location_key, False)

            # Broadcast token unavailable status
            broadcast_token_status(location_key, False)

            return {
                'statusCode': 403,
                'body': json.dumps(f'Token validation failed: {message}', cls=DecimalEncoder)
            }

        # Fetch weather data
        weather_data = fetch_weather_data(city, country)
        weather_data['last_updated'] = datetime.now().isoformat()

        # Update Redis with weather data and token status
        update_redis_weather(weather_data, location_key)
        update_redis_can_update(location_key, False)

        # Schedule token refresh
        schedule_token_refresh(location_key)

        # Send weather update to worker for distribution
        broadcast_data = {
            'type': 'weather_update',
            'data': weather_data,
            'timestamp': int(time.time()),
            'location': f"{city}, {country}",
            'city': city,
            'country': country,
            'clientId': client_id,  # For routing back to requesting client
            'broadcast_to_all': True    # Also broadcast to all interested clients
        }

        # Send to worker (not directly to clients)
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(broadcast_data, cls=DecimalEncoder)
        )

        # Broadcast token unavailable status
        broadcast_token_status(location_key, False)

        return {
            'statusCode': 200,
            'body': json.dumps('Weather data fetched and sent to worker', cls=DecimalEncoder)
        }

    except Exception as e:
        logger.error(f"Error handling weather request: {str(e)}")
        error_data = {
            'type': 'weather_error',
            'message': f'Failed to fetch weather data for {city}, {country}',
            'timestamp': int(time.time()),
            'location': f"{city}, {country}",
            'city': city,
            'country': country,
            'clientId': client_id
        }
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(error_data, cls=DecimalEncoder)
        )
        return {
            'statusCode': 500,
            'body': json.dumps('Weather request failed', cls=DecimalEncoder)
        }

def broadcast_token_status(location_key, is_available):
    """Send token status to worker via WebSocket API Gateway, not directly to clients"""
    try:
        # Parse location key back to city and country
        parts = location_key.split('_')
        if len(parts) >= 2:
            city = parts[0].title()
            country = parts[1].upper()

            # Create message for worker to distribute
            status_data = {
                'type': 'token_available' if is_available else 'token_unavailable',
                'city': city,
                'country': country,
                'location': f"{city}, {country}",
                'timestamp': int(time.time()),
                'broadcast_to_all': True  # Tell worker to broadcast to all relevant clients
            }

            # Send through WebSocket API Gateway - worker will receive this
            # Get all active WebSocket connections (these are worker connections)
            response = table.scan()
            connections = response.get('Items', [])

            for connection in connections:
                connection_id = connection['connectionId']
                try:
                    apigw_client.post_to_connection(
                        ConnectionId=connection_id,
                        Data=json.dumps(status_data, cls=DecimalEncoder)
                    )
                    logger.info(f"Sent token status to worker connection: {connection_id}")
                except Exception as e:
                    logger.warning(f"Failed to notify worker connection {connection_id}: {str(e)}")

    except Exception as e:
        logger.error(f"Error broadcasting token status: {str(e)}")


def broadcast_message(apigw_client, message, sender_id):
    """Send message to all connected clients"""
    try:
        response = table.scan()
        connections = response.get('Items', [])

        broadcast_data = {
            'type': 'broadcast',
            'message': message,
            'from': sender_id,
            'timestamp': int(time.time())
        }

        for connection in connections:
            connection_id = connection['connectionId']
            try:
                apigw_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=json.dumps(broadcast_data, cls=DecimalEncoder)
                )
            except apigw_client.exceptions.GoneException:
                print(f"Removing stale connection: {connection_id}")
                table.delete_item(Key={'connectionId': connection_id})

        return {
            'statusCode': 200,
            'body': json.dumps(f'Message broadcast to {len(connections)} connections', cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error broadcasting message: {str(e)}")
        raise

def echo_message(apigw_client, connection_id, message_data):
    """Echo message back to sender"""
    try:
        echo_data = {
            'type': 'echo',
            'message': message_data,
            'timestamp': int(time.time())
        }

        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(echo_data, cls=DecimalEncoder)
        )

        return {
            'statusCode': 200,
            'body': json.dumps('Message echoed back', cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error echoing message: {str(e)}")
        error_message = 'Failed to echo message'
        if DEBUG_MODE:
            error_message += f': {str(e)}'

        return {
            'statusCode': 500,
            'body': json.dumps(error_message, cls=DecimalEncoder)
        }

def update_redis_weather(weather_data, location_key):
    """Update Upstash Redis with the latest weather data for a specific location"""
    try:
        redis_url = os.environ.get('UPSTASH_REDIS_REST_URL')
        redis_token = os.environ.get('UPSTASH_REDIS_REST_TOKEN')

        if not redis_url or not redis_token:
            print("Redis credentials not configured, skipping Redis update")
            return False

        headers = {
            "Authorization": f"Bearer {redis_token}",
            "Content-Type": "application/json"
        }

        print(f"Updating Redis at URL: {redis_url} for location: {location_key}")
	
        weather_payload = ["SET", f"latest_weather_{location_key}", json.dumps(weather_data)]
        weather_response = requests.post(
            redis_url,
            headers=headers,
            json=weather_payload,
            timeout=10
        )

        if weather_response.status_code == 200:
            print(f"Successfully updated Redis with weather data for {location_key}")
            return True
        else:
            print(f"Failed to update Redis for {location_key}")
            return False

    except Exception as e:
        print(f"Error updating Redis for {location_key}: {str(e)}")
        return False

def update_redis_can_update(location_key, can_update):
    """Update Redis with can_update status for a location"""
    try:
        redis_url = os.environ.get('UPSTASH_REDIS_REST_URL')
        redis_token = os.environ.get('UPSTASH_REDIS_REST_TOKEN')

        if not redis_url or not redis_token:
            print("Redis credentials not configured, skipping Redis update")
            return False

        headers = {
            "Authorization": f"Bearer {redis_token}",
            "Content-Type": "application/json"
        }

        # Get current token data from Redis and update can_update field
        get_payload = ["GET", f"token_{location_key}"]
        get_response = requests.post(
            redis_url,
            headers=headers,
            json=get_payload,
            timeout=10
        )

        if get_response.status_code == 200:
            result = get_response.json().get('result')
            if result:
                token_data = json.loads(result)
                token_data['can_update'] = can_update

                set_payload = ["SET", f"token_{location_key}", json.dumps(token_data)]
                set_response = requests.post(
                    redis_url,
                    headers=headers,
                    json=set_payload,
                    timeout=10
                )

                if set_response.status_code == 200:
                    print(f"Successfully updated Redis can_update status for {location_key}")
                    return True

        print(f"Failed to update Redis can_update status for {location_key}")
        return False

    except Exception as e:
        print(f"Error updating Redis can_update status: {str(e)}")
        return False

def validate_and_consume_token(location_key, provided_token):
    try:
        response = rate_limit_table.update_item(
            Key={'id': f'token_{location_key}'},
            UpdateExpression='SET can_update = :false',
            ConditionExpression='attribute_exists(id) AND #token = :token AND can_update = :true',
            ExpressionAttributeNames={'#token': 'token'},
            ExpressionAttributeValues={
                ':token': provided_token,
                ':true': True,
                ':false': False
            },
            ReturnValues='ALL_OLD'
        )
        return True, "Token consumed successfully"
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return False, "Invalid token or already used"
        raise

def refresh_location_token(location_key, event=None):
    """Refresh token for a specific location and broadcast availability via worker"""
    generate_and_store_token(location_key, can_update=True)
    logger.info(f"Token refreshed and can_update set to True for {location_key}")

    # Update Redis immediately
    update_redis_can_update(location_key, True)

    # Broadcast token availability through worker
    broadcast_token_status(location_key, True)

    # Clean up the schedule if present
    if event and event.get('schedule_name'):
        try:
            scheduler = boto3.client('scheduler')
            scheduler.delete_schedule(Name=event['schedule_name'])
            logger.info(f"Deleted EventBridge schedule: {event['schedule_name']}")
        except Exception as e:
            logger.warning(f"Failed to delete schedule: {str(e)}")

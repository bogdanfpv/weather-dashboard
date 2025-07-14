import json
import boto3
import os
import time
import requests
from datetime import datetime
from decimal import Decimal
from urllib.parse import quote
import requests

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)  # Convert Decimal to float
        return super(DecimalEncoder, self).default(obj)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
DEBUG_MODE = os.environ.get('DEBUG_MODE', 'false').lower() == 'true'

RATE_LIMIT_TABLE = os.environ.get('RATE_LIMIT_TABLE', 'WeatherRateLimit')
rate_limit_table = dynamodb.Table(RATE_LIMIT_TABLE)
RATE_LIMIT_MINUTES = 1

OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY')
if not OPENWEATHER_API_KEY:
    raise RuntimeError('OPENWEATHER_API_KEY environment variable is not set')

def get_apigw_client(event):
    endpoint = f"https://{event['requestContext']['domainName']}/{event['requestContext']['stage']}"
    return boto3.client('apigatewaymanagementapi', endpoint_url=endpoint)

def fetch_weather_data(city="Paris", country="FR"):
    """Fetch weather data from OpenWeatherMap API"""
    try:
        # Current weather
        current_url = f"http://api.openweathermap.org/data/2.5/weather?q={city},{country}&appid={OPENWEATHER_API_KEY}&units=metric"
        current_response = requests.get(current_url, timeout=10)
        current_data = current_response.json()

        #Watch for deprecation of One call 2.5
        if current_response.status_code != 200:
            raise Exception(f"OpenWeatherMap API error: {current_data.get('message', 'Unknown error')}")

        # 5-day forecast
        forecast_url = f"http://api.openweathermap.org/data/2.5/forecast?q={city},{country}&appid={OPENWEATHER_API_KEY}&units=metric"
        forecast_response = requests.get(forecast_url, timeout=10)
        forecast_data = forecast_response.json()

        # UV index (optional, requires separate API call)
        uv_url = f"http://api.openweathermap.org/data/2.5/uvi?lat={current_data['coord']['lat']}&lon={current_data['coord']['lon']}&appid={OPENWEATHER_API_KEY}"
        uv_response = requests.get(uv_url, timeout=10)
        uv_data = uv_response.json()

        # Transform the data to match your frontend format
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

        # Convert daily data to frontend format (next 5 days)
        for date, data in list(daily_data.items())[:5]:
            day_data = {
                "day": date.strftime("%a"),
                "date": date.strftime("%d/%m"),
                "low": round(min(data["temps"])),
                "high": round(max(data["temps"])),
                "wind": f"{round(max(data['winds']) * 3.6)}mph",
                "rain": "0%",  # You could calculate this
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
        # Parse the incoming message
        body = json.loads(event.get('body', '{}'))
        message_type = body.get('action', 'echo')
        message_data = body.get('data', 'Hello from WebSocket!')

        apigw_client = get_apigw_client(event)

        if message_type == 'get_rate_limit_status':
            last_update = get_last_update_time()
            now = int(time.time())
            can_update = True
            next_update_time = None
            if last_update and now - last_update < RATE_LIMIT_MINUTES * 60:
                can_update = False
                next_update_time = last_update + RATE_LIMIT_MINUTES * 60

            rate_limit_data = {
                'type': 'rate_limit_status',
                'canUpdate': can_update,
                'nextUpdateTime': next_update_time,
                'timestamp': now
            }
            apigw_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(rate_limit_data, cls=DecimalEncoder)
            )
            return {
                'statusCode': 200,
                'body': json.dumps('Rate limit status sent', cls=DecimalEncoder)
            }

        if message_type == 'get_weather':
            # Fetch weather data and broadcast to all clients
            city = body.get('city', 'Paris')
            country = body.get('country', 'FR')
            return handle_weather_request(apigw_client, connection_id, city, country)
        elif message_type == 'broadcast':
            # Send message to all connected clients
            return broadcast_message(apigw_client, message_data, connection_id)
        else:
            # Echo message back to sender
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

def handle_weather_request(apigw_client, connection_id, city, country):
    """Handle weather data request and broadcast to all clients"""
    try:
        # Rate limit check
        last_update = get_last_update_time()
        now = int(time.time())
        if last_update and now - last_update < RATE_LIMIT_MINUTES * 60:
            next_update_time = last_update + RATE_LIMIT_MINUTES * 60
            denial_data = {
                'type': 'weather_request_denied',
                'message': 'Weather update request denied. Please wait before requesting again.',
                'nextUpdateTime': next_update_time,
                'timestamp': now
            }
            apigw_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(denial_data, cls=DecimalEncoder)
            )
            return {
                'statusCode': 429,
                'body': json.dumps('Rate limit active', cls=DecimalEncoder)
            }

        weather_data = fetch_weather_data(city, country)
        set_last_update_time()
        update_redis(weather_data)

        broadcast_data = {
            'type': 'weather_update',
            'data': weather_data,
            'timestamp': now,
            'requested_by': connection_id
        }

        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(broadcast_data, cls=DecimalEncoder)
        )

        return {
            'statusCode': 200,
            'body': json.dumps('Weather data fetched and sent', cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error handling weather request: {str(e)}")
        # Send error message back to requester
        try:
            error_message = str(e) if DEBUG_MODE else "An error occurred processing your request"
            error_data = {
                'type': 'weather_error',
                'message': f'Failed to fetch weather data: {error_message}',
                'timestamp': int(time.time())
            }
            apigw_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(error_data, cls=DecimalEncoder)
            )
        except Exception as inner_e:
            print(f"Error sending error message: {str(inner_e)}")

        return {
            'statusCode': 500,
            'body': json.dumps('Weather request failed', cls=DecimalEncoder)
        }

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
                    Data=json.dumps(broadcast_data, cls=DecimalEncoder)
                )
            except apigw_client.exceptions.GoneException:
                # Connection is stale, remove it
                print(f"Removing stale connection: {connection_id}")
                table.delete_item(Key={'connectionId': connection_id})

        return {
            'statusCode': 200,
            'body': json.dumps(f'Message broadcast to {len(connections)} connections', cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error broadcasting message: {str(e)}")
        raise

def get_last_update_time():
    try:
        response = rate_limit_table.get_item(Key={'id': 'last_update'})
        return response['Item']['timestamp']
    except KeyError:
        return None

def set_last_update_time():
    rate_limit_table.put_item(Item={'id': 'last_update', 'timestamp': int(time.time())})

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

def update_redis(weather_data):
    """Update Upstash Redis with the latest weather data"""
    try:
        # Get Redis credentials from environment variables
        redis_url = os.environ.get('UPSTASH_REDIS_REST_URL')
        redis_token = os.environ.get('UPSTASH_REDIS_REST_TOKEN')

        if not redis_url or not redis_token:
            print("Redis credentials not configured, skipping Redis update")
            return False

        # Prepare headers for Upstash REST API
        headers = {
            "Authorization": f"Bearer {redis_token}",
            "Content-Type": "application/json"
        }

        print(f"Updating Redis at URL: {redis_url}")

        # Store weather data using proper Upstash REST API format
        weather_payload = ["SET", "latest_weather", json.dumps(weather_data)]
        weather_response = requests.post(
            redis_url,
            headers=headers,
            json=weather_payload,
            timeout=10
        )

        # Store last updated timestamp using proper Upstash REST API format
        timestamp = datetime.now().isoformat()
        timestamp_payload = ["SET", "last_updated", timestamp]
        timestamp_response = requests.post(
            redis_url,
            headers=headers,
            json=timestamp_payload,
            timeout=10
        )

        print(f"Redis update responses - Weather: {weather_response.status_code}, Data: {weather_response.text}")
        print(f"Redis timestamp responses - Status: {timestamp_response.status_code}, Data: {timestamp_response.text}")

        if weather_response.status_code == 200 and timestamp_response.status_code == 200:
            print("Successfully updated Redis with weather data and timestamp")
            return True
        else:
            print(f"Failed to update Redis - Weather: {weather_response.text}, Timestamp: {timestamp_response.text}")
            return False

    except Exception as e:
        print(f"Error updating Redis: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return False
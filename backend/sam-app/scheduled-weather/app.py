import json
import boto3
import os
import requests
from datetime import datetime
from decimal import Decimal

# Reuse the same classes and functions from your message/app.py
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)  # Convert Decimal to float
        return super(DecimalEncoder, self).default(obj)

OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY')
if not OPENWEATHER_API_KEY:
    raise RuntimeError('OPENWEATHER_API_KEY environment variable is not set')

def fetch_weather_data(city="Paris", country="FR"):
    """Fetch weather data from OpenWeatherMap API"""
    try:
        # Current weather
        current_url = f"http://api.openweathermap.org/data/2.5/weather?q={city},{country}&appid={OPENWEATHER_API_KEY}&units=metric"
        current_response = requests.get(current_url, timeout=10)
        current_data = current_response.json()

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

def lambda_handler(event, context):
    """Handler for scheduled weather updates"""
    try:
        
        print("Starting scheduled weather update")
        # Default to Paris if no city is specified
        city = "Paris"
        country = "FR"

        # Fetch weather data
        weather_data = fetch_weather_data(city, country)

        # Update Redis
        update_result = update_redis(weather_data)

        # Set timestamp in DynamoDB for rate limiting if needed
        dynamodb = boto3.resource('dynamodb')
        rate_limit_table = dynamodb.Table(os.environ.get('RATE_LIMIT_TABLE', 'WeatherRateLimit'))
        rate_limit_table.put_item(Item={'id': 'last_update', 'timestamp': int(datetime.now().timestamp())})

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Scheduled weather update completed successfully',
                'redis_update_success': update_result
            }, cls=DecimalEncoder)
        }
    except Exception as e:
        print(f"Error in scheduled weather update: {str(e)}")
        import traceback
        print(traceback.format_exc())

        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': f'Error in scheduled weather update: {str(e)}'
            }, cls=DecimalEncoder)
        }
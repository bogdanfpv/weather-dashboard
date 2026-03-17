import json
import os
import requests
import logging
from datetime import datetime
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY')
if not OPENWEATHER_API_KEY:
    raise RuntimeError('OPENWEATHER_API_KEY environment variable is not set')

def get_location_key(city, country):
    """Generate a consistent key for location-based storage"""
    return f"{city.lower()}_{country.lower()}"

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
                    "winds": [],
                    "rain": []
                }
            daily_data[date]["temps"].append(item['main']['temp'])
            daily_data[date]["conditions"].append(item['weather'][0]['main'])
            daily_data[date]["winds"].append(item['wind']['speed'])
            rain_mm = item.get('rain', {}).get('3h', 0)
            daily_data[date]["rain"].append(rain_mm)

        for date, data in list(daily_data.items())[:5]:
            day_data = {
                "day": date.strftime("%a"),
                "date": date.strftime("%d/%m"),
                "low": round(min(data["temps"])),
                "high": round(max(data["temps"])),
                "wind": f"{round(max(data['winds']) * 3.6)}mph",
                "rain": f"{round(sum(data['rain']), 1)}mm" if sum(data['rain']) > 0 else "0mm",
                "icon": map_weather_icon(max(set(data["conditions"]), key=data["conditions"].count))
            }
            weather_update["daily"].append(day_data)

        return weather_update

    except Exception as e:
        logger.error(f"Error fetching weather data: {str(e)}")
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

def update_redis(weather_data, location_key):
    """Update Upstash Redis with the latest weather data for a specific location"""
    try:
        redis_url = os.environ.get('UPSTASH_REDIS_REST_URL')
        redis_token = os.environ.get('UPSTASH_REDIS_REST_TOKEN')

        if not redis_url or not redis_token:
            logger.warning("Redis credentials not configured, skipping Redis update")
            return False

        headers = {
            "Authorization": f"Bearer {redis_token}",
            "Content-Type": "application/json"
        }

        logger.info(f"Updating Redis at URL: {redis_url} for location: {location_key}")

        weather_payload = ["SET", f"latest_weather_{location_key}", json.dumps(weather_data)]
        weather_response = requests.post(
            redis_url,
            headers=headers,
            json=weather_payload,
            timeout=10
        )

        logger.info(f"Redis update response for {location_key} - Status: {weather_response.status_code}")

        if weather_response.status_code == 200:
            logger.info(f"Successfully updated Redis with weather data for {location_key}")
            return True
        else:
            logger.error(f"Failed to update Redis for {location_key} - Response: {weather_response.text}")
            return False

    except Exception as e:
        logger.error(f"Error updating Redis for {location_key}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def lambda_handler(event, context):
    """Handler for scheduled weather updates - runs every 6 hours"""
    try:
        logger.info("Starting scheduled weather update (6-hour cycle)")

        # Read cities from environment variable
        cities_env = os.environ.get('DEFAULT_CITIES', '')
        cities_to_update = []

        for city_country in cities_env.split('|'):
            city_country = city_country.strip()
            if city_country:
                parts = city_country.split(',')
                if len(parts) == 2:
                    cities_to_update.append({
                        "city": parts[0].strip(),
                        "country": parts[1].strip()
                    })

        if event.get('city') and event.get('country'):
            cities_to_update = [{"city": event['city'], "country": event['country']}]
            logger.info(f"Processing single city from event: {event['city']}, {event['country']}")
        else:
            logger.info(f"Processing {len(cities_to_update)} default cities from environment")

        results = []
        successful_updates = 0
        failed_updates = 0

        for location in cities_to_update:
            city = location['city']
            country = location['country']
            location_key = get_location_key(city, country)

            try:
                logger.info(f"Fetching weather data for {city}, {country}")

                weather_data = fetch_weather_data(city, country)
                weather_data['last_updated'] = datetime.now().isoformat()

                redis_success = update_redis(weather_data, location_key)

                if redis_success:
                    successful_updates += 1
                    result_status = "success"
                    logger.info(f"Successfully updated weather for {city}, {country}")
                else:
                    failed_updates += 1
                    result_status = "failure"
                    logger.warning(f"Failed to update weather for {city}, {country}")

                results.append({
                    "location": f"{city}, {country}",
                    "location_key": location_key,
                    "status": result_status,
                    "redis_success": redis_success
                })

            except Exception as e:
                failed_updates += 1
                error_msg = str(e)
                logger.error(f"Failed to update {city}, {country}: {error_msg}")
                results.append({
                    "location": f"{city}, {country}",
                    "location_key": location_key,
                    "status": "error",
                    "error": error_msg
                })

        logger.info(f"Weather update completed - Success: {successful_updates}, Failed: {failed_updates}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Scheduled weather update completed',
                'total_processed': len(cities_to_update),
                'successful_updates': successful_updates,
                'failed_updates': failed_updates,
                'results': results
            }, cls=DecimalEncoder)
        }

    except Exception as e:
        logger.error(f"Error in scheduled weather update: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())

        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': f'Error in scheduled weather update: {str(e)}'
            }, cls=DecimalEncoder)
        }
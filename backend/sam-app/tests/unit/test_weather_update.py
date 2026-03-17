import json
import boto3
import pytest
from moto import mock_aws
import os
import sys
from unittest.mock import patch, MagicMock
from datetime import datetime

# Set environment variables BEFORE any imports
os.environ['AWS_DEFAULT_REGION'] = 'eu-north-1'
os.environ['OPENWEATHER_API_KEY'] = 'test-api-key'
os.environ['DEFAULT_CITIES'] = 'Paris,FR|London,GB|Tokyo,JP'
os.environ['UPSTASH_REDIS_REST_URL'] = 'https://test-redis.upstash.io'
os.environ['UPSTASH_REDIS_REST_TOKEN'] = 'test-redis-token'


@pytest.fixture
def mock_weather_responses():
    """Create mock responses for OpenWeatherMap API"""
    current_data = {
        'name': 'Paris',
        'sys': {'country': 'FR', 'sunrise': 1234567890, 'sunset': 1234598490},
        'coord': {'lat': 48.85, 'lon': 2.35},
        'main': {'temp': 20, 'temp_max': 25, 'temp_min': 15, 'humidity': 60, 'pressure': 1013},
        'weather': [{'main': 'Clear', 'description': 'clear sky'}],
        'wind': {'speed': 5},
        'visibility': 10000
    }

    forecast_data = {
        'list': [{
            'dt': 1234567890 + (i * 3600),
            'main': {'temp': 20 + i, 'temp_max': 25, 'temp_min': 15},
            'weather': [{'main': 'Clear'}],
            'wind': {'speed': 5}
        } for i in range(40)]
    }

    uv_data = {'value': 5}

    return {
        'current': current_data,
        'forecast': forecast_data,
        'uv': uv_data
    }


@patch('requests.post')
@patch('requests.get')
def test_weather_update_scheduled_run(mock_get, mock_post, mock_weather_responses):
    """Test scheduled weather update for all default cities"""

    # Mock OpenWeatherMap API responses
    mock_current = MagicMock()
    mock_current.status_code = 200
    mock_current.json.return_value = mock_weather_responses['current']

    mock_forecast = MagicMock()
    mock_forecast.status_code = 200
    mock_forecast.json.return_value = mock_weather_responses['forecast']

    mock_uv = MagicMock()
    mock_uv.status_code = 200
    mock_uv.json.return_value = mock_weather_responses['uv']

    mock_get.side_effect = [mock_current, mock_forecast, mock_uv] * 3  # For 3 cities

    # Mock Redis response
    mock_redis_response = MagicMock()
    mock_redis_response.status_code = 200
    mock_post.return_value = mock_redis_response

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import lambda_handler

    # Scheduled event (no specific city)
    event = {}

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['total_processed'] == 3  # Paris, London, Tokyo
    assert body['successful_updates'] == 3
    assert body['failed_updates'] == 0
    assert len(body['results']) == 3


@patch('requests.post')
@patch('requests.get')
def test_weather_update_single_city(mock_get, mock_post, mock_weather_responses):
    """Test weather update for a single city"""

    mock_current = MagicMock()
    mock_current.status_code = 200
    mock_current.json.return_value = mock_weather_responses['current']

    mock_forecast = MagicMock()
    mock_forecast.status_code = 200
    mock_forecast.json.return_value = mock_weather_responses['forecast']

    mock_uv = MagicMock()
    mock_uv.status_code = 200
    mock_uv.json.return_value = mock_weather_responses['uv']

    mock_get.side_effect = [mock_current, mock_forecast, mock_uv]

    mock_redis_response = MagicMock()
    mock_redis_response.status_code = 200
    mock_post.return_value = mock_redis_response

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import lambda_handler

    # Event with specific city
    event = {
        'city': 'Paris',
        'country': 'FR'
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['total_processed'] == 1
    assert body['successful_updates'] == 1
    assert body['results'][0]['location'] == 'Paris, FR'


@patch('requests.post')
@patch('requests.get')
def test_weather_update_api_error(mock_get, mock_post):
    """Test handling of OpenWeatherMap API errors"""

    # Mock API error response
    mock_error = MagicMock()
    mock_error.status_code = 404
    mock_error.json.return_value = {'message': 'City not found'}
    mock_get.return_value = mock_error

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import lambda_handler

    event = {
        'city': 'InvalidCity',
        'country': 'XX'
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['failed_updates'] == 1
    assert body['results'][0]['status'] == 'error'


@patch('requests.post')
@patch('requests.get')
def test_weather_update_redis_failure(mock_get, mock_post, mock_weather_responses):
    """Test handling of Redis update failures"""

    mock_current = MagicMock()
    mock_current.status_code = 200
    mock_current.json.return_value = mock_weather_responses['current']

    mock_forecast = MagicMock()
    mock_forecast.status_code = 200
    mock_forecast.json.return_value = mock_weather_responses['forecast']

    mock_uv = MagicMock()
    mock_uv.status_code = 200
    mock_uv.json.return_value = mock_weather_responses['uv']

    mock_get.side_effect = [mock_current, mock_forecast, mock_uv]

    # Mock Redis failure
    mock_redis_response = MagicMock()
    mock_redis_response.status_code = 500
    mock_redis_response.text = 'Redis error'
    mock_post.return_value = mock_redis_response

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import lambda_handler

    event = {
        'city': 'Paris',
        'country': 'FR'
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['failed_updates'] == 1
    assert body['results'][0]['redis_success'] == False


@patch('requests.get')
def test_weather_update_fetch_weather_data(mock_get, mock_weather_responses):
    """Test fetch_weather_data function directly"""

    mock_current = MagicMock()
    mock_current.status_code = 200
    mock_current.json.return_value = mock_weather_responses['current']

    mock_forecast = MagicMock()
    mock_forecast.status_code = 200
    mock_forecast.json.return_value = mock_weather_responses['forecast']

    mock_uv = MagicMock()
    mock_uv.status_code = 200
    mock_uv.json.return_value = mock_weather_responses['uv']

    mock_get.side_effect = [mock_current, mock_forecast, mock_uv]

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import fetch_weather_data

    weather_data = fetch_weather_data('Paris', 'FR')

    assert weather_data['location'] == 'Paris, FR'
    assert 'current' in weather_data
    assert 'hourly' in weather_data
    assert 'daily' in weather_data
    assert weather_data['current']['temp'] == 20
    assert len(weather_data['hourly']) == 7  # First 7 hours
    assert len(weather_data['daily']) <= 5  # Up to 5 days


def test_weather_update_map_weather_icon():
    """Test weather icon mapping"""

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import map_weather_icon

    assert map_weather_icon('Clear') == 'clear'
    assert map_weather_icon('Clouds') == 'cloudy'
    assert map_weather_icon('Rain') == 'rain'
    assert map_weather_icon('Snow') == 'snow'
    assert map_weather_icon('Drizzle') == 'rain'
    assert map_weather_icon('Thunderstorm') == 'rain'
    assert map_weather_icon('Mist') == 'cloudy'
    assert map_weather_icon('Fog') == 'cloudy'
    assert map_weather_icon('Unknown') == 'clear'  # Default


def test_weather_update_get_location_key():
    """Test location key generation"""

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import get_location_key

    assert get_location_key('Paris', 'FR') == 'paris_fr'
    assert get_location_key('LONDON', 'GB') == 'london_gb'
    assert get_location_key('New York', 'US') == 'new york_us'


@patch('requests.post')
def test_weather_update_redis_no_credentials(mock_post):
    """Test Redis update without credentials"""

    # Temporarily remove Redis credentials
    old_url = os.environ.get('UPSTASH_REDIS_REST_URL')
    old_token = os.environ.get('UPSTASH_REDIS_REST_TOKEN')

    os.environ.pop('UPSTASH_REDIS_REST_URL', None)
    os.environ.pop('UPSTASH_REDIS_REST_TOKEN', None)

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import update_redis

    result = update_redis({'test': 'data'}, 'paris_fr')

    assert result == False
    assert not mock_post.called

    # Restore credentials
    if old_url:
        os.environ['UPSTASH_REDIS_REST_URL'] = old_url
    if old_token:
        os.environ['UPSTASH_REDIS_REST_TOKEN'] = old_token


@patch('requests.post')
@patch('requests.get')
def test_weather_update_partial_failure(mock_get, mock_post, mock_weather_responses):
    """Test handling when some cities succeed and others fail"""

    # First city succeeds
    mock_success_current = MagicMock()
    mock_success_current.status_code = 200
    mock_success_current.json.return_value = mock_weather_responses['current']

    mock_success_forecast = MagicMock()
    mock_success_forecast.status_code = 200
    mock_success_forecast.json.return_value = mock_weather_responses['forecast']

    mock_success_uv = MagicMock()
    mock_success_uv.status_code = 200
    mock_success_uv.json.return_value = mock_weather_responses['uv']

    # Second city fails
    mock_fail = MagicMock()
    mock_fail.status_code = 404
    mock_fail.json.return_value = {'message': 'City not found'}

    mock_get.side_effect = [
        mock_success_current, mock_success_forecast, mock_success_uv,  # Paris succeeds
        mock_fail  # London fails
    ]

    mock_redis = MagicMock()
    mock_redis.status_code = 200
    mock_post.return_value = mock_redis

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import lambda_handler

    event = {}

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['successful_updates'] >= 1
    assert body['failed_updates'] >= 1


@patch('requests.get')
def test_weather_update_timeout_error(mock_get):
    """Test handling of request timeout"""

    mock_get.side_effect = Exception('Request timeout')

    sys.path.insert(0, '.aws-sam/build/WeatherUpdateFunction')
    from app import lambda_handler

    event = {
        'city': 'Paris',
        'country': 'FR'
    }

    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body['failed_updates'] == 1
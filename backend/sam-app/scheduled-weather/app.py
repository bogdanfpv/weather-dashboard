import json
import boto3
import os
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')

def get_location_key(city, country):
    """Generate a consistent key for location-based storage"""
    return f"{city.lower()}_{country.lower()}"

def refresh_token_for_location(location_key):
    """Refresh token for a specific location by calling the token Lambda"""
    try:
        token_function_arn = os.environ.get('TOKEN_FUNCTION_ARN')
        if not token_function_arn:
            logger.error("TOKEN_FUNCTION_ARN not configured, skipping token refresh")
            return False

        response = lambda_client.invoke(
            FunctionName=token_function_arn,
            InvocationType='Event',
            Payload=json.dumps({
                'action': 'refresh_token',
                'location_key': location_key
            })
        )

        logger.info(f"Triggered token refresh for {location_key}")
        return True

    except Exception as e:
        logger.error(f"Error refreshing token for {location_key}: {str(e)}")
        return False

def lambda_handler(event, context):
    """Handler for scheduled token refresh - runs every 60 minutes"""
    try:
        logger.info("Starting scheduled token refresh")

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
                logger.info(f"Refreshing token for {city}, {country}")

                token_refresh_success = refresh_token_for_location(location_key)

                if token_refresh_success:
                    successful_updates += 1
                    result_status = "success"
                    logger.info(f"Successfully refreshed token for {city}, {country}")
                else:
                    failed_updates += 1
                    result_status = "failure"
                    logger.warning(f"Failed to refresh token for {city}, {country}")

                results.append({
                    "location": f"{city}, {country}",
                    "location_key": location_key,
                    "status": result_status,
                    "token_refresh_success": token_refresh_success
                })

            except Exception as e:
                failed_updates += 1
                error_msg = str(e)
                logger.error(f"Failed to refresh token for {city}, {country}: {error_msg}")
                results.append({
                    "location": f"{city}, {country}",
                    "location_key": location_key,
                    "status": "error",
                    "error": error_msg
                })

        logger.info(f"Token refresh completed - Success: {successful_updates}, Failed: {failed_updates}")
        if 'RequestType' in event:
            from urllib.request import urlopen, Request

            response_body = {
                'Status': 'SUCCESS',
                'Reason': 'Token refresh completed',
                'PhysicalResourceId': context.log_stream_name,
                'StackId': event['StackId'],
                'RequestId': event['RequestId'],
                'LogicalResourceId': event['LogicalResourceId']
            }

            req = Request(
                event['ResponseURL'],
                data=json.dumps(response_body).encode('utf-8'),
                headers={'content-type': '', 'content-length': str(len(json.dumps(response_body)))},
                method='PUT'
            )
            urlopen(req)

            return "SUCCESS"

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Scheduled token refresh completed',
                'total_processed': len(cities_to_update),
                'successful_updates': successful_updates,
                'failed_updates': failed_updates,
                'results': results
            })
        }

    except Exception as e:
        logger.error(f"Error in scheduled token refresh: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())

        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': f'Error in scheduled token refresh: {str(e)}'
            })
        }
import { Redis } from '@upstash/redis';

export const runtime = 'edge';

export async function GET(request) {
    try {
        const redis = Redis.fromEnv();
        const { searchParams } = new URL(request.url);

        // Get location from query parameters
        const location = searchParams.get('location');

        if (!location) {
            return Response.json({
                success: false,
                message: 'Location parameter is required'
            }, {
                status: 400,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
        }

        // Generate the same location key format used by Lambda
        const locationKey = location.toLowerCase();

        console.log(`Fetching cached weather for location key: ${locationKey}`);

        // Retrieve the weather data from Redis using location-specific keys
        const cachedWeather = await redis.get(`latest_weather_${locationKey}`);
        const lastUpdated = await redis.get(`last_updated_${locationKey}`);

        if (!cachedWeather) {
            return Response.json({
                success: false,
                message: `No cached weather data available for ${location}`,
                location: location,
                locationKey: locationKey
            }, {
                status: 404,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
        }

        console.log(`Found cached weather data for ${location}`);

        return Response.json({
            success: true,
            data: cachedWeather,
            lastUpdated: lastUpdated || new Date().toISOString(),
            location: location,
            locationKey: locationKey
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    } catch (error) {
        console.error('Error retrieving cached weather:', error);
        return Response.json({
            success: false,
            message: 'Failed to retrieve cached weather data',
            error: error.message
        }, {
            status: 500,
            headers: {
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
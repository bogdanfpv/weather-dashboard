import { Redis } from '@upstash/redis';

export const runtime = 'edge';

export async function GET(request) {
    try {
        const redis = Redis.fromEnv();

        // Retrieve the weather data from Redis
        const cachedWeather = await redis.get('latest_weather');
        const lastUpdated = await redis.get('last_updated');

        if (!cachedWeather) {
            return Response.json({
                success: false,
                message: 'No cached weather data available'
            }, {
                status: 404,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
        }

        return Response.json({
            success: true,
            data: cachedWeather,
            lastUpdated
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    } catch (error) {
        console.error('Error retrieving cached weather:', error);
        return Response.json({
            success: false,
            message: 'Failed to retrieve cached weather data'
        }, {
            status: 500,
            headers: {
                'Cache-Control': 'no-store'
            }
        });
    }
}
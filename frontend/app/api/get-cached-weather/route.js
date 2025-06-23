import { Redis } from '@upstash/redis';

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
            }, { status: 404 });
        }

        return Response.json({
            success: true,
            data: cachedWeather,
            lastUpdated
        });
    } catch (error) {
        console.error('Error retrieving cached weather:', error);
        return Response.json({
            success: false,
            message: 'Failed to retrieve cached weather data'
        }, { status: 500 });
    }
}
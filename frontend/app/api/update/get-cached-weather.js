// /api/get-cached-weather.js
export async function GET(request) {
    try {
        // Retrieve the weather data from your storage
        const { kv } = require('@vercel/kv');
        const cachedWeather = await kv.get('latest_weather');
        const lastUpdated = await kv.get('last_updated');

        if (!cachedWeather) {
            return new Response(JSON.stringify({
                success: false,
                message: 'No cached weather data available'
            }), { status: 404 });
        }

        return new Response(JSON.stringify({
            success: true,
            data: JSON.parse(cachedWeather),
            lastUpdated
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            message: 'Failed to retrieve cached weather data'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
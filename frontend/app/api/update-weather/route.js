// app/api/update-weather/route.js
import { Redis } from '@upstash/redis';
import { revalidatePath } from 'next/cache';

// Force Edge Runtime - provides browser-like WebSocket support
export const runtime = 'edge';

export async function GET(request) {
    try {
        console.log('Cron job started - connecting to AWS WebSocket...');

        // In Edge Runtime, WebSocket is available globally (like in browser)
        const weatherData = await new Promise((resolve, reject) => {
            let isResolved = false;

            const resolveOnce = (data) => {
                if (!isResolved) {
                    isResolved = true;
                    resolve(data);
                }
            };

            const rejectOnce = (error) => {
                if (!isResolved) {
                    isResolved = true;
                    reject(error);
                }
            };

            const ws = new WebSocket('wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod');

            const timeoutId = setTimeout(() => {
                ws.close();
                rejectOnce(new Error('WebSocket connection timed out after 20 seconds'));
            }, 20000);

            ws.onopen = () => {
                console.log('WebSocket connected from cron job (Edge Runtime)');

                ws.send(JSON.stringify({
                    action: 'get_weather',
                    city: 'Paris',
                    country: 'FR',
                    timestamp: Math.floor(Date.now() / 1000)
                }));
            };

            ws.onmessage = (event) => {
                try {
                    clearTimeout(timeoutId);
                    const data = JSON.parse(event.data);
                    console.log('WebSocket message received:', data);

                    // Handle API Gateway error responses
                    if (data.message === 'Forbidden' || data.message === 'Internal server error') {
                        console.error('API Gateway error:', data);
                        ws.close();
                        rejectOnce(new Error(`API Error: ${data.message}`));
                        return;
                    }

                    // Handle message types
                    switch (data.type) {
                        case 'weather_update':
                            console.log('Weather data updated:', data.data);
                            ws.close();
                            resolveOnce(data.data);
                            break;

                        case 'weather_error':
                            console.error('Weather fetch error:', data.message);
                            ws.close();
                            rejectOnce(new Error(data.message));
                            break;

                        case 'test':
                        case 'broadcast':
                        case 'echo':
                        default:
                            console.log('Received non-weather message:', data.type);
                            break;
                    }
                } catch (error) {
                    clearTimeout(timeoutId);
                    ws.close();
                    rejectOnce(new Error(`Error parsing message: ${error.message}`));
                }
            };

            ws.onerror = (error) => {
                clearTimeout(timeoutId);
                console.error('WebSocket error in cron job:', error);
                rejectOnce(new Error(`WebSocket error: ${error.message || 'Connection failed'}`));
            };

            ws.onclose = (event) => {
                clearTimeout(timeoutId);
                console.log('WebSocket closed in cron job. Code:', event.code, 'Reason:', event.reason);
                if (event.code !== 1000 && event.code !== 1005 && !isResolved) {
                    rejectOnce(new Error(`WebSocket closed unexpectedly. Code: ${event.code}`));
                }
            };
        });

        // Store the weather data in Redis with better error handling
        await storeWeatherData(weatherData);

        // Trigger revalidation of your static pages
        revalidatePath('/');

        console.log('Cron job completed successfully');
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            message: 'Weather data updated successfully via WebSocket (Edge Runtime)',
            location: weatherData.location
        });

    } catch (error) {
        console.error('Cron job failed:', error);
        return Response.json({
            success: false,
            message: error.message,
            timestamp: new Date().toISOString(),
            stack: error.stack // Add stack trace for debugging
        }, { status: 500 });
    }
}

// Helper function to store weather data in Redis with better error handling
async function storeWeatherData(data) {
    try {
        console.log('Attempting to connect to Redis...');

        // Check if environment variables exist
        if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
            throw new Error('Redis environment variables not found. Please check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
        }

        const redis = Redis.fromEnv();

        console.log('Redis client created, storing weather data...');

        // Store weather data
        await redis.set('latest_weather', JSON.stringify(data));
        await redis.set('last_updated', new Date().toISOString());

        console.log('Weather data stored successfully in Redis');
    } catch (error) {
        console.error('Failed to store weather data in Redis:', error.message);
        console.error('Error stack:', error.stack);
        throw error;
    }
}

// Alternative version using Node.js runtime if Edge Runtime continues to have issues
// export const runtime = 'nodejs'; // Uncomment this line if you need to switch to Node.js runtime
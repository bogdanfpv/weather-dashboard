import { Redis } from '@upstash/redis';
import { revalidatePath } from 'next/cache';

export async function GET(request) {
    try {
        console.log('Cron job started - connecting to AWS WebSocket...');

        // Create a promise-based WebSocket connection to YOUR AWS endpoint
        const weatherData = await new Promise((resolve, reject) => {
            // Dynamic import to avoid serverless issues
            import('ws').then(({ WebSocket }) => {
                const ws = new WebSocket('wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod');

                // Set timeout for WebSocket connection
                const timeoutId = setTimeout(() => {
                    ws.close();
                    reject(new Error('WebSocket connection timed out after 25 seconds'));
                }, 25000); // 25 second timeout (under Vercel's 30s limit)

                ws.on('open', () => {
                    console.log('WebSocket connected from cron job');

                    // Send the same message your frontend sends
                    ws.send(JSON.stringify({
                        action: 'get_weather',
                        city: 'Paris',
                        country: 'FR',
                        timestamp: Math.floor(Date.now() / 1000)
                    }));
                });

                ws.on('message', async (data) => {
                    try {
                        clearTimeout(timeoutId);
                        const parsedData = JSON.parse(data.toString());
                        console.log('Cron job received WebSocket data:', parsedData.type);

                        if (parsedData.type === 'weather_update' && parsedData.data) {
                            ws.close();
                            resolve(parsedData.data);
                        } else if (parsedData.type === 'weather_error') {
                            ws.close();
                            reject(new Error(`Weather API error: ${parsedData.message}`));
                        } else {
                            // Handle other message types or continue waiting
                            console.log('Received non-weather message:', parsedData.type);
                        }
                    } catch (error) {
                        clearTimeout(timeoutId);
                        ws.close();
                        reject(new Error(`Error parsing WebSocket message: ${error.message}`));
                    }
                });

                ws.on('error', (error) => {
                    clearTimeout(timeoutId);
                    console.error('WebSocket error in cron job:', error);
                    reject(new Error(`WebSocket error: ${error.message}`));
                });

                ws.on('close', (code, reason) => {
                    clearTimeout(timeoutId);
                    console.log('WebSocket closed in cron job. Code:', code, 'Reason:', reason.toString());
                    if (code !== 1000) { // 1000 = normal closure
                        reject(new Error(`WebSocket closed unexpectedly. Code: ${code}, Reason: ${reason.toString()}`));
                    }
                });

            }).catch(reject);
        });

        // Store the weather data in Redis
        await storeWeatherData(weatherData);

        // Trigger revalidation of your static pages
        revalidatePath('/');

        console.log('Cron job completed successfully');
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            message: 'Weather data updated successfully via WebSocket',
            location: weatherData.location
        });

    } catch (error) {
        console.error('Cron job failed:', error);
        return Response.json({
            success: false,
            message: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// Helper function to store weather data in Redis
async function storeWeatherData(data) {
    try {
        const redis = Redis.fromEnv();

        await redis.set('latest_weather', JSON.stringify(data));
        await redis.set('last_updated', new Date().toISOString());

        console.log('Weather data stored successfully in Redis');
    } catch (error) {
        console.error('Failed to store weather data in Redis:', error);
        throw error;
    }
}
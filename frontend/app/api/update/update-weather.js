// /api/update-weather.js
import { revalidatePath } from 'next/cache';
import { WebSocket } from 'ws'; // Need to install: npm install ws

export async function GET(request) {
    return new Promise(async (resolve) => {
        try {
            const ws = new WebSocket('wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod');
            let timeoutId;

            // Set a timeout to prevent hanging
            timeoutId = setTimeout(() => {
                ws.close();
                resolve(new Response(JSON.stringify({
                    success: false,
                    message: 'WebSocket connection timed out'
                }), { status: 504 }));
            }, 10000); // 10 second timeout

            ws.on('open', () => {
                console.log('WebSocket connected from cron job');

                // Send the same request your client would send
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
                    console.log('Received weather data in cron job');

                    if (parsedData.type === 'weather_update' && parsedData.data) {
                        // Store the weather data in your database/storage
                        await storeWeatherData(parsedData.data);

                        // Trigger a revalidation of your static pages
                        revalidatePath('/');

                        ws.close();
                        resolve(new Response(JSON.stringify({
                            success: true,
                            timestamp: new Date().toISOString(),
                            message: 'Weather data updated successfully via WebSocket'
                        })));
                    } else if (parsedData.type === 'weather_error') {
                        ws.close();
                        resolve(new Response(JSON.stringify({
                            success: false,
                            message: parsedData.message
                        }), { status: 500 }));
                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                    ws.close();
                    resolve(new Response(JSON.stringify({
                        success: false,
                        message: error.message
                    }), { status: 500 }));
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeoutId);
                console.error('WebSocket error in cron job:', error);
                resolve(new Response(JSON.stringify({
                    success: false,
                    message: 'WebSocket error: ' + error.message
                }), { status: 500 }));
            });

            ws.on('close', () => {
                clearTimeout(timeoutId);
                console.log('WebSocket closed in cron job');
            });

        } catch (error) {
            console.error('Failed to execute cron job:', error);
            resolve(new Response(JSON.stringify({
                success: false,
                message: error.message
            }), { status: 500 }));
        }
    });
}

// Helper function to store weather data
async function storeWeatherData(data) {
    // Here you would implement your storage logic
    // Example using a simple JSON file if you're using Vercel KV or similar:

    try {
        // For Vercel KV (you would need to set up Vercel KV first)
        const { kv } = require('@vercel/kv');
        await kv.set('latest_weather', JSON.stringify(data));
        await kv.set('last_updated', new Date().toISOString());
        console.log('Weather data stored successfully');
    } catch (error) {
        console.error('Failed to store weather data:', error);
        throw error;
    }
}
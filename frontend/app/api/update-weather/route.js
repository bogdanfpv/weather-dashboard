// app/api/update-weather/route.js
import { Redis } from '@upstash/redis';
import { WebSocket } from 'undici';

export async function GET() {
    try {
        const weatherData = await new Promise((resolve, reject) => {
            const ws = new WebSocket('wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod');

            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Timeout'));
            }, 15000);

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    action: 'get_weather',
                    city: 'Paris',
                    country: 'FR',
                    timestamp: Math.floor(Date.now() / 1000)
                }));
            };

            ws.onmessage = (event) => {
                clearTimeout(timeout);
                const data = JSON.parse(event.data);
                if (data.type === 'weather_update') {
                    ws.close();
                    resolve(data.data);
                }
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('WebSocket failed'));
            };
        });

        const redis = Redis.fromEnv();
        await redis.set('latest_weather', JSON.stringify(weatherData));

        return Response.json({ success: true, data: weatherData });
    } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
}
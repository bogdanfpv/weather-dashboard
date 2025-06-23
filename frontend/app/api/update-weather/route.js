// app/api/update-weather/route.js
import { Redis } from '@upstash/redis';
import { revalidatePath } from 'next/cache';

// ✅ Essential Edge Runtime configurations
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;

// ✅ Explicitly disable static optimization
export const fetchCache = 'force-no-store';

export async function GET(request) {
    const startTime = Date.now();

    try {
        console.log('🚀 [EDGE] Cron job started - WebSocket connection attempt');

        // ✅ Environment validation with detailed logging
        const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
        const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisToken) {
            throw new Error('Missing Redis environment variables');
        }

        console.log('✅ [EDGE] Environment variables validated');

        // ✅ Validate WebSocket availability in Edge Runtime
        if (typeof WebSocket === 'undefined') {
            throw new Error('WebSocket not available in current runtime');
        }

        console.log('✅ [EDGE] WebSocket API available');

        // ✅ WebSocket connection with enhanced error handling
        const weatherData = await connectAndFetchWeather();

        // ✅ Store data in Redis
        await storeWeatherData(weatherData);

        // ✅ Revalidate static pages
        try {
            revalidatePath('/');
            console.log('✅ [EDGE] Path revalidation triggered');
        } catch (revalidateError) {
            console.warn('⚠️ [EDGE] Revalidation failed (non-critical):', revalidateError.message);
        }

        const duration = Date.now() - startTime;
        console.log(`✅ [EDGE] Cron job completed successfully in ${duration}ms`);

        return new Response(JSON.stringify({
            success: true,
            timestamp: new Date().toISOString(),
            message: 'Weather data updated successfully via WebSocket (Edge Runtime)',
            location: weatherData.location,
            duration: `${duration}ms`,
            runtime: 'edge'
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [EDGE] Cron job failed after ${duration}ms:`, error);

        return new Response(JSON.stringify({
            success: false,
            message: error.message,
            timestamp: new Date().toISOString(),
            duration: `${duration}ms`,
            runtime: 'edge',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}

// ✅ Separate WebSocket connection function for better error handling
async function connectAndFetchWeather() {
    return new Promise((resolve, reject) => {
        let isResolved = false;
        let ws = null;

        const resolveOnce = (data) => {
            if (!isResolved) {
                isResolved = true;
                if (ws) ws.close();
                resolve(data);
            }
        };

        const rejectOnce = (error) => {
            if (!isResolved) {
                isResolved = true;
                if (ws) ws.close();
                reject(error);
            }
        };

        try {
            console.log('🔌 [EDGE] Initiating WebSocket connection...');
            ws = new WebSocket('wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod');

            // ✅ Shorter timeout for faster failure detection
            const timeoutId = setTimeout(() => {
                console.log('⏰ [EDGE] WebSocket timeout after 15 seconds');
                rejectOnce(new Error('WebSocket connection timed out after 15 seconds'));
            }, 15000);

            ws.onopen = () => {
                console.log('✅ [EDGE] WebSocket connection established');

                const message = {
                    action: 'get_weather',
                    city: 'Paris',
                    country: 'FR',
                    timestamp: Math.floor(Date.now() / 1000)
                };

                console.log('📤 [EDGE] Sending weather request:', message);
                ws.send(JSON.stringify(message));
            };

            ws.onmessage = (event) => {
                try {
                    clearTimeout(timeoutId);
                    const data = JSON.parse(event.data);
                    console.log('📥 [EDGE] WebSocket message received:', data.type || 'unknown');

                    // ✅ Handle API Gateway errors
                    if (data.message === 'Forbidden') {
                        rejectOnce(new Error('API Gateway Forbidden - Check WebSocket URL and permissions'));
                        return;
                    }

                    if (data.message === 'Internal server error') {
                        rejectOnce(new Error('API Gateway Internal Error - Backend service issue'));
                        return;
                    }

                    // ✅ Handle weather responses
                    switch (data.type) {
                        case 'weather_update':
                            console.log('🌤️ [EDGE] Weather data received successfully');
                            resolveOnce(data.data);
                            break;

                        case 'weather_error':
                            console.error('🌧️ [EDGE] Weather fetch error:', data.message);
                            rejectOnce(new Error(`Weather API error: ${data.message}`));
                            break;

                        case 'connection_established':
                        case 'echo':
                        case 'test':
                            console.log('📨 [EDGE] Received handshake/test message');
                            break;

                        default:
                            console.log('📨 [EDGE] Received unknown message type:', data.type);
                            break;
                    }
                } catch (parseError) {
                    clearTimeout(timeoutId);
                    console.error('🔥 [EDGE] Error parsing WebSocket message:', parseError);
                    rejectOnce(new Error(`Message parsing error: ${parseError.message}`));
                }
            };

            ws.onerror = (error) => {
                clearTimeout(timeoutId);
                console.error('🔥 [EDGE] WebSocket error:', error);
                rejectOnce(new Error(`WebSocket connection error: ${error.message || 'Unknown error'}`));
            };

            ws.onclose = (event) => {
                clearTimeout(timeoutId);
                console.log(`🔌 [EDGE] WebSocket closed - Code: ${event.code}, Reason: ${event.reason || 'No reason'}`);

                if (event.code !== 1000 && event.code !== 1005 && !isResolved) {
                    rejectOnce(new Error(`WebSocket closed unexpectedly - Code: ${event.code}, Reason: ${event.reason || 'Unknown'}`));
                }
            };

        } catch (connectionError) {
            console.error('🔥 [EDGE] Failed to create WebSocket:', connectionError);
            rejectOnce(new Error(`WebSocket creation failed: ${connectionError.message}`));
        }
    });
}

// ✅ Enhanced Redis storage with retry logic
async function storeWeatherData(data) {
    let retries = 3;

    while (retries > 0) {
        try {
            console.log('💾 [EDGE] Storing weather data in Redis...');
            const redis = Redis.fromEnv();

            await Promise.all([
                redis.set('latest_weather', JSON.stringify(data)),
                redis.set('last_updated', new Date().toISOString())
            ]);

            console.log('✅ [EDGE] Weather data stored successfully in Redis');
            return;

        } catch (error) {
            retries--;
            console.error(`❌ [EDGE] Redis storage failed (${3 - retries}/3):`, error.message);

            if (retries === 0) {
                throw new Error(`Redis storage failed after 3 attempts: ${error.message}`);
            }

            // Wait 1 second before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}
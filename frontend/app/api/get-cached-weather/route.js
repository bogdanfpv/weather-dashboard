export const runtime = 'edge';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
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

        const locationKey = location.toLowerCase().replace(', ', '_');

        console.log(`Fetching cached weather for: ${locationKey}`);

const cachedWeather = await fetch(
            `${process.env.WEATHER_BACKEND_URL}?latest_weather=${locationKey}`,
            {
                cache: "no-store",
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    Pragma: "no-cache",
                },
            }
        );

        console.log(`Backend response status: ${cachedWeather.status}`);

        if (!cachedWeather.ok) {
            const errorText = await cachedWeather.text();
            console.error(`Backend error: ${cachedWeather.status} - ${errorText}`);

            return Response.json({
                success: false,
                message: `Backend returned ${cachedWeather.status}`,
                details: errorText,
                location: location,
                locationKey: locationKey
            }, {
                status: 404,
                headers: {
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        const response = await cachedWeather.json();
        if (response.data && typeof response.data === 'string') {
            response.data = JSON.parse(response.data);
        }
        console.log('Worker response:', JSON.stringify(response));
        const lastUpdated = response.lastUpdated;

        console.log(`Backend response:`, response);

        if (!response.success || !response.data) {
            console.log(`No cached data available for ${location}`);
            return Response.json({
                success: false,
                message: `No cached weather data available for ${location}`,
                location: location,
                locationKey: locationKey
            }, {
                status: 404,
                headers: {
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        console.log(`Found cached weather data for ${location}`);

        return Response.json({
            success: true,
            data: response.data,
            lastUpdated: lastUpdated,
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
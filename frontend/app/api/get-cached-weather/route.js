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

        const cachedWeather = await fetch(`https://weather-backend-middleman.texidev.cc?latest_weather=${locationKey}`, {                         cache: "no-store",
                            headers: {
                                "Cache-Control": "no-cache, no-store, must-revalidate",
                                Pragma: "no-cache",
                            },
                        },
                    );

        if (!cachedWeather.ok) {
                    return Response.json({
                        success: false,
                        message: `Failed to fetch weather data: ${cachedWeather.status}`
                    }, { status: 500 });
        }

        const response = await cachedWeather.json();
        const lastUpdated = response.lastUpdated;

        if (!response.success || !response.data) {
            return Response.json({
                success: false,
                message: `No cached weather data available for ${location}`,
                location: location,
                locationKey: locationKey
            }, { status: 404 });
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
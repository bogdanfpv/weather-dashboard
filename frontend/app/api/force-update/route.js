export async function POST(request) {
    try {
        // Call the same logic as the cron job
        const updateResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/update-weather`);
        const result = await updateResponse.json();

        return Response.json({
            success: result.success,
            message: `Manual update triggered: ${result.message}`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return Response.json({
            success: false,
            message: `Manual update failed: ${error.message}`
        }, { status: 500 });
    }
}
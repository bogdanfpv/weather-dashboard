import { Redis } from '@upstash/redis';

export async function GET() {
    try {
        const redis = Redis.fromEnv(); // Uses REDIS_URL automatically

        // Test Redis connection
        await redis.set('test', 'connection-works');
        const result = await redis.get('test');
        await redis.del('test');

        return Response.json({
            success: true,
            message: 'Redis connection successful',
            testResult: result
        });
    } catch (error) {
        console.error('Redis connection failed:', error);
        return Response.json({
            success: false,
            message: 'Redis connection failed',
            error: error.message
        }, { status: 500 });
    }
}
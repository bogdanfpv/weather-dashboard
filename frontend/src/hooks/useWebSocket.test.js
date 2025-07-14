import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

// Mock WebSocket
class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = WebSocket.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;

        // Simulate connection opening
        setTimeout(() => {
            this.readyState = WebSocket.OPEN;
            if (this.onopen) this.onopen();
        }, 0);
    }

    send(data) {
        this.lastSentMessage = data;
    }

    close() {
        this.readyState = WebSocket.CLOSED;
        if (this.onclose) this.onclose({ code: 1000, reason: 'Normal closure' });
    }

    // Helper method to simulate receiving messages
    simulateMessage(data) {
        if (this.onmessage) {
            this.onmessage({ data: JSON.stringify(data) });
        }
    }
}

// Setup global WebSocket mock
global.WebSocket = MockWebSocket;
global.WebSocket.CONNECTING = 0;
global.WebSocket.OPEN = 1;
global.WebSocket.CLOSING = 2;
global.WebSocket.CLOSED = 3;

describe('useWebSocket Rate Limiting', () => {
    let mockWebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Capture the WebSocket instance for testing
        const originalWebSocket = global.WebSocket;
        global.WebSocket = class extends originalWebSocket {
            constructor(...args) {
                super(...args);
                mockWebSocket = this;
            }
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Initial Rate Limit Status', () => {
        it('should request rate limit status on connection', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Wait for connection to open
            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            expect(mockWebSocket.lastSentMessage).toEqual(
                JSON.stringify({
                    action: 'get_rate_limit_status',
                    city: 'Paris',
                    country: 'FR'
                })
            );
        });

        it('should initialize with canUpdateWeather as false', () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            expect(result.current.canUpdateWeather).toBe(false);
            expect(result.current.nextUpdateTime).toBeNull();
        });
    });

    describe('Rate Limit Status Messages', () => {
        it('should handle rate_limit_status message when updates are allowed', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Simulate rate limit status message - updates allowed
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: true,
                    nextUpdateTime: null,
                    timestamp: 1000
                });
            });

            expect(result.current.canUpdateWeather).toBe(true);
            expect(result.current.nextUpdateTime).toBeNull();
        });

        it('should handle rate_limit_status message when updates are blocked', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            const nextUpdateTime = Date.now() / 1000 + 2700; // 45 minutes from now

            // Simulate rate limit status message - updates blocked
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: false,
                    nextUpdateTime: nextUpdateTime,
                    timestamp: 1000
                });
            });

            expect(result.current.canUpdateWeather).toBe(false);
            expect(result.current.nextUpdateTime).toBe(nextUpdateTime);
            expect(result.current.notifications).toHaveLength(1);
            expect(result.current.notifications[0].type).toBe('rate_limit');
            expect(result.current.notifications[0].message).toContain('Weather updates available again at');
        });

        it('should handle rate_limit_updated message', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Simulate rate limit becoming available
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_updated',
                    canUpdate: true,
                    nextUpdateTime: null,
                    timestamp: 1000
                });
            });

            expect(result.current.canUpdateWeather).toBe(true);
            expect(result.current.nextUpdateTime).toBeNull();
            expect(result.current.notifications).toHaveLength(1);
            expect(result.current.notifications[0].type).toBe('rate_limit_available');
            expect(result.current.notifications[0].message).toBe('Weather updates are now available!');
        });

        it('should handle rate_limit_updated message when still blocked', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            const nextUpdateTime = Date.now() / 1000 + 1800; // 30 minutes from now

            // Simulate rate limit still active
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_updated',
                    canUpdate: false,
                    nextUpdateTime: nextUpdateTime,
                    timestamp: 1000
                });
            });

            expect(result.current.canUpdateWeather).toBe(false);
            expect(result.current.nextUpdateTime).toBe(nextUpdateTime);
            expect(result.current.notifications).toHaveLength(1);
            expect(result.current.notifications[0].type).toBe('rate_limit');
            expect(result.current.notifications[0].message).toContain('Weather updates limited until');
        });
    });

    describe('Weather Request Denied', () => {
        it('should handle weather_request_denied message', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Simulate weather request denied
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'weather_request_denied',
                    message: 'Weather update request denied. Please wait before requesting again.',
                    nextUpdateTime: Date.now() / 1000 + 2700,
                    timestamp: 1000
                });
            });

            expect(result.current.isLoadingWeather).toBe(false);
            expect(result.current.notifications).toHaveLength(1);
            expect(result.current.notifications[0].type).toBe('error');
            expect(result.current.notifications[0].message).toBe('Weather update request denied. Please wait before requesting again.');
        });
    });

    describe('requestWeatherUpdate Function', () => {
        it('should prevent weather requests when not connected', () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Don't wait for connection - call immediately while disconnected
            act(() => {
                const success = result.current.requestWeatherUpdate();
                expect(success).toBe(false);
            });

            expect(result.current.notifications).toHaveLength(1);
            expect(result.current.notifications[0].type).toBe('error');
            expect(result.current.notifications[0].message).toBe('Cannot update weather: Not connected to server');
        });

        it('should prevent weather requests when rate limited', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Wait for connection
            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Set rate limit state
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: false,
                    nextUpdateTime: Date.now() / 1000 + 2700,
                    timestamp: 1000
                });
            });

            act(() => {
                const success = result.current.requestWeatherUpdate();
                expect(success).toBe(false);
            });

            expect(result.current.notifications).toHaveLength(2); // One from rate_limit_status, one from failed request
            // Find the error notification (not the rate_limit one)
            const errorNotification = result.current.notifications.find(n => n.type === 'error');
            expect(errorNotification).toBeDefined();
            expect(errorNotification.message).toContain('Weather updates are rate limited');
        });

        it('should allow weather requests when connected and not rate limited', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Wait for connection
            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Set rate limit state to allow updates
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: true,
                    nextUpdateTime: null,
                    timestamp: 1000
                });
            });

            act(() => {
                const success = result.current.requestWeatherUpdate('London', 'UK');
                expect(success).toBe(true);
            });

            expect(result.current.isLoadingWeather).toBe(true);
            const sentMessage = JSON.parse(mockWebSocket.lastSentMessage);
            expect(sentMessage.action).toBe('get_weather');
            expect(sentMessage.city).toBe('London');
            expect(sentMessage.country).toBe('UK');
            expect(typeof sentMessage.timestamp).toBe('number')
        });

        it('should show helpful error message with next update time', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Wait for connection
            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            const nextUpdateTime = Date.now() / 1000 + 2700;

            // Set rate limit state
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: false,
                    nextUpdateTime: nextUpdateTime,
                    timestamp: 1000
                });
            });

            act(() => {
                const success = result.current.requestWeatherUpdate();
                expect(success).toBe(false);
            });

            const errorNotification = result.current.notifications.find(n => n.type === 'error');
            expect(errorNotification).toBeDefined();
            expect(errorNotification.message).toContain('Try again at');
            expect(errorNotification.message).toContain(new Date(nextUpdateTime * 1000).toLocaleTimeString());
        });
    });

    describe('Connection State Changes', () => {
        it('should reset rate limit state on disconnect', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Wait for connection and set rate limit state
            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: true,
                    nextUpdateTime: null,
                    timestamp: 1000
                });
            });

            expect(result.current.canUpdateWeather).toBe(true);

            // Simulate disconnect
            act(() => {
                mockWebSocket.close();
            });

            expect(result.current.canUpdateWeather).toBe(false);
            expect(result.current.nextUpdateTime).toBeNull();
            expect(result.current.isLoadingWeather).toBe(false);
        });

        it('should reset rate limit state on error', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Wait for connection and set rate limit state
            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: true,
                    nextUpdateTime: null,
                    timestamp: 1000
                });
            });

            expect(result.current.canUpdateWeather).toBe(true);

            // Simulate error
            act(() => {
                if (mockWebSocket.onerror) {
                    mockWebSocket.onerror(new Error('Connection error'));
                }
            });

            expect(result.current.canUpdateWeather).toBe(false);
            expect(result.current.nextUpdateTime).toBeNull();
            expect(result.current.isLoadingWeather).toBe(false);
        });
    });

    describe('Weather Success Flow', () => {
        it('should handle successful weather update and reset loading state', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Wait for connection
            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Set rate limit state to allow updates
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: true,
                    nextUpdateTime: null,
                    timestamp: 1000
                });
            });

            // Request weather update
            act(() => {
                result.current.requestWeatherUpdate();
            });
            expect(result.current.isLoadingWeather).toBe(true);

            // Simulate successful weather response
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'weather_update',
                    data: {
                        location: 'Paris, FR',
                        current: { temp: 20 }
                    },
                    timestamp: 1000
                });
            });

            expect(result.current.isLoadingWeather).toBe(false);
            expect(result.current.weatherData).toEqual({
                location: 'Paris, FR',
                current: { temp: 20 }
            });
            expect(result.current.notifications).toHaveLength(1);
            expect(result.current.notifications[0].type).toBe('weather_alert');
        });

        it('should handle weather error and reset loading state', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            // Wait for connection
            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Set rate limit state to allow updates
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: true,
                    nextUpdateTime: null,
                    timestamp: 1000
                });
            });

            // Request weather update
            act(() => {
                result.current.requestWeatherUpdate();
            });
            expect(result.current.isLoadingWeather).toBe(true);

            // Simulate weather error response
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'weather_error',
                    message: 'API key invalid',
                    timestamp: 1000
                });
            });

            expect(result.current.isLoadingWeather).toBe(false);
            expect(result.current.notifications).toHaveLength(1);
            expect(result.current.notifications[0].type).toBe('error');
            expect(result.current.notifications[0].message).toBe('API key invalid');
        });
    });

    describe('Edge Cases', () => {
        it('should handle malformed rate limit messages gracefully', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Simulate malformed rate limit message
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    // Missing required fields - should default to safe values
                    timestamp: 1000
                });
            });

            // Should not crash and should maintain safe defaults
            expect(result.current.canUpdateWeather).toBe(false);
            expect(result.current.nextUpdateTime).toBeNull();
        });

        it('should handle rate limit message with nextUpdateTime but no time display', async () => {
            const { result } = renderHook(() => useWebSocket('ws://localhost:8080'));

            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            // Set rate limit state without nextUpdateTime
            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'rate_limit_status',
                    canUpdate: false,
                    nextUpdateTime: null,
                    timestamp: 1000
                });
            });

            act(() => {
                const success = result.current.requestWeatherUpdate();
                expect(success).toBe(false);
            });

            const errorNotification = result.current.notifications.find(n => n.type === 'error');
            expect(errorNotification).toBeDefined();
            expect(errorNotification.message).toContain('Try again at later');
        });
    });
});
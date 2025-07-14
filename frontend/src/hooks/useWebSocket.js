import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url, { defaultCity = 'Paris', defaultCountry = 'FR' } = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [weatherData, setWeatherData] = useState(null);
    const [isLoadingWeather, setIsLoadingWeather] = useState(false);
    const [canUpdateWeather, setCanUpdateWeather] = useState(false);
    const [nextUpdateTime, setNextUpdateTime] = useState(null);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        // Don't connect if URL is null or WebSocket is already open
        if (!url || wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            wsRef.current = new WebSocket(url);

            wsRef.current.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);

                // Request current rate limit status on connection
                sendMessage({
                    action: 'get_rate_limit_status',
                    city: defaultCity,
                    country: defaultCountry
                });
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('WebSocket message received:', data);

                    // Handle API Gateway error responses
                    if (data.message === 'Forbidden' || data.message === 'Internal server error') {
                        console.error('API Gateway error:', data);
                        setIsLoadingWeather(false);
                        setNotifications(prev => [{
                            type: 'error',
                            message: `API Error: ${data.message}. Check your WebSocket configuration.`,
                            timestamp: Math.floor(Date.now() / 1000)
                        }, ...prev.slice(0, 9)]);
                        return;
                    }

                    // Handle different message types
                    switch (data.type) {
                        case 'weather_update':
                            console.log('Weather data updated:', data.data);
                            setWeatherData(data.data);
                            setIsLoadingWeather(false);
                            setNotifications(prev => [{
                                type: 'weather_alert',
                                message: `Weather data updated for ${data.data.location}`,
                                timestamp: data.timestamp
                            }, ...prev.slice(0, 9)]);
                            break;

                        case 'weather_error':
                            console.error('Weather fetch error:', data.message);
                            setIsLoadingWeather(false);
                            setNotifications(prev => [{
                                type: 'error',
                                message: data.message,
                                timestamp: data.timestamp
                            }, ...prev.slice(0, 9)]);
                            break;

                        case 'rate_limit_status':
                            console.log('Rate limit status received:', data);
                            // Handle malformed messages gracefully
                            const canUpdate = data.canUpdate ?? false;
                            const nextUpdate = data.nextUpdateTime || null;

                            setCanUpdateWeather(canUpdate);
                            setNextUpdateTime(nextUpdate);

                            if (!canUpdate && nextUpdate) {
                                setNotifications(prev => [{
                                    type: 'rate_limit',
                                    message: `Weather updates available again at ${new Date(nextUpdate * 1000).toLocaleTimeString()}`,
                                    timestamp: data.timestamp
                                }, ...prev.slice(0, 9)]);
                            }
                            break;

                        case 'rate_limit_updated':
                            console.log('Rate limit updated:', data);
                            setCanUpdateWeather(data.canUpdate);
                            setNextUpdateTime(data.nextUpdateTime);

                            const message = data.canUpdate
                                ? 'Weather updates are now available!'
                                : `Weather updates limited until ${new Date(data.nextUpdateTime * 1000).toLocaleTimeString()}`;

                            setNotifications(prev => [{
                                type: data.canUpdate ? 'rate_limit_available' : 'rate_limit',
                                message,
                                timestamp: data.timestamp
                            }, ...prev.slice(0, 9)]);
                            break;

                        case 'weather_request_denied':
                            console.log('Weather request denied due to rate limit');
                            setIsLoadingWeather(false);
                            setNotifications(prev => [{
                                type: 'error',
                                message: data.message || 'Weather update request denied. Please wait before requesting again.',
                                timestamp: data.timestamp
                            }, ...prev.slice(0, 9)]);
                            break;

                        case 'test':
                        case 'broadcast':
                        case 'echo':
                        default:
                            setNotifications(prev => [data, ...prev.slice(0, 9)]);
                            break;
                    }
                } catch (e) {
                    console.error('Error parsing WebSocket message:', e);
                    setIsLoadingWeather(false);
                }
            };

            wsRef.current.onclose = (event) => {
                console.log('WebSocket disconnected. Code:', event.code, 'Reason:', event.reason);
                setIsConnected(false);
                setIsLoadingWeather(false);
                setCanUpdateWeather(false);
                setNextUpdateTime(null);

                // Auto-reconnect after 5 seconds
                reconnectTimeoutRef.current = setTimeout(connect, 5000);
            };

            wsRef.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                setIsConnected(false);
                setIsLoadingWeather(false);
                setCanUpdateWeather(false);
                setNextUpdateTime(null);
            };

        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
        }
    }, [url, defaultCity, defaultCountry]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsConnected(false);
        setIsLoadingWeather(false);
        setCanUpdateWeather(false);
        setNextUpdateTime(null);
    }, []);

    const sendMessage = useCallback((message) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
                const messageStr = JSON.stringify(message);
                console.log('Sending WebSocket message:', messageStr);
                wsRef.current.send(messageStr);
                return true;
            } catch (error) {
                console.error('Error sending WebSocket message:', error);
                return false;
            }
        } else {
            console.error('WebSocket is not connected. Ready state:', wsRef.current?.readyState);
            return false;
        }
    }, []);

    const requestWeatherUpdate = useCallback((city = defaultCity, country = defaultCountry) => {
        if (!isConnected) {
            console.error('Cannot request weather: WebSocket not connected');
            setNotifications(prev => [{
                type: 'error',
                message: 'Cannot update weather: Not connected to server',
                timestamp: Math.floor(Date.now() / 1000)
            }, ...prev.slice(0, 9)]);
            return false;
        }

        if (!canUpdateWeather) {
            console.error('Cannot request weather: Rate limit active');
            const nextUpdateStr = nextUpdateTime
                ? new Date(nextUpdateTime * 1000).toLocaleTimeString()
                : 'later';
            setNotifications(prev => [{
                type: 'error',
                message: `Weather updates are rate limited. Try again at ${nextUpdateStr}`,
                timestamp: Math.floor(Date.now() / 1000)
            }, ...prev.slice(0, 9)]);
            return false;
        }

        setIsLoadingWeather(true);
        const success = sendMessage({
            action: 'get_weather',
            city: city,
            country: country,
            timestamp: Math.floor(Date.now() / 1000)
        });

        if (!success) {
            setIsLoadingWeather(false);
            setNotifications(prev => [{
                type: 'error',
                message: 'Failed to send weather request',
                timestamp: Math.floor(Date.now() / 1000)
            }, ...prev.slice(0, 9)]);
        }

        return success;
    }, [isConnected, canUpdateWeather, nextUpdateTime, sendMessage]);

    useEffect(() => {
        if (url) {
            connect();
        } else {
            disconnect();
        }
        return disconnect;
    }, [url, connect, disconnect]);

    const clearNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    return {
        isConnected,
        notifications,
        weatherData,
        isLoadingWeather,
        canUpdateWeather,
        nextUpdateTime,
        clearNotifications,
        sendMessage,
        requestWeatherUpdate
    };
}
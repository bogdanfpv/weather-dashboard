import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url) {
    const [isConnected, setIsConnected] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        if (!url || wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            wsRef.current = new WebSocket(url);

            wsRef.current.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('WebSocket notification:', data);

                    // Add notification to list
                    setNotifications(prev => [data, ...prev.slice(0, 9)]); // Keep last 10
                } catch (e) {
                    console.error('Error parsing WebSocket message:', e);
                }
            };

            wsRef.current.onclose = () => {
                console.log('WebSocket disconnected');
                setIsConnected(false);

                // Auto-reconnect after 5 seconds
                reconnectTimeoutRef.current = setTimeout(connect, 5000);
            };

            wsRef.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                setIsConnected(false);
            };

        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
        }
    }, [url]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsConnected(false);
    }, []);

    useEffect(() => {
        connect();
        return disconnect;
    }, [connect, disconnect]);

    const clearNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    return {
        isConnected,
        notifications,
        clearNotifications
    };
}
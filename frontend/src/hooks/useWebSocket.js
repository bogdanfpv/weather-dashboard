import { useState, useEffect, useRef, useCallback } from "react";

export function useWebSocket(url, { city = "Paris", country = "FR" } = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [weatherData, setWeatherData] = useState(null);
    const [isLoadingWeather, setIsLoadingWeather] = useState(false);
    const [canUpdateWeather, setCanUpdateWeather] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const currentLocationRef = useRef({ city, country });

    useEffect(() => {
        currentLocationRef.current = { city, country };
    }, [city, country]);

    const connect = useCallback(() => {
        if (!url || wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            console.log(`Connecting to CloudFlare Worker WebSocket: ${url}`);
            wsRef.current = new WebSocket(url);

            wsRef.current.onopen = () => {
                console.log("WebSocket connected to CloudFlare Worker");
                setIsConnected(true);

                // Request initial rate limit status for current location
                wsRef.current.send(JSON.stringify({
                    action: "get_rate_limit_status",
                    city: currentLocationRef.current.city,
                    country: currentLocationRef.current.country
                }));
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("Received message:", data.type);

                    // Handle rate limit status response
                    if (data.type === "rate_limit_status") {
                        setCanUpdateWeather(data.can_update || false);
                        console.log(`Rate limit status for ${data.location} - can_update: ${data.can_update}`);
                        return;
                    }

                    // Handle token available message
                    if (data.type === "token_available") {
                        const messageLocation = normalizeLocation(data.city, data.country, data.location);
                        const currentLocation = normalizeLocation(
                            currentLocationRef.current.city,
                            currentLocationRef.current.country
                        );

                        if (messageLocation === currentLocation) {
                            setCanUpdateWeather(true);
                            console.log(`Token available for current location: ${messageLocation}`);

                            setNotifications((prev) => [
                                {
                                    type: "success",
                                    message: `Weather updates are now available for ${data.location || messageLocation}`,
                                    timestamp: Math.floor(Date.now() / 1000),
                                },
                                ...prev.slice(0, 9),
                            ]);
                        }
                        return;
                    }

                    // Handle token unavailable message
                    if (data.type === "token_unavailable") {
                        const messageLocation = normalizeLocation(data.city, data.country, data.location);
                        const currentLocation = normalizeLocation(
                            currentLocationRef.current.city,
                            currentLocationRef.current.country
                        );

                        if (messageLocation === currentLocation) {
                            setCanUpdateWeather(false);
                            console.log(`Token unavailable for current location: ${messageLocation}`);
                        }
                        return;
                    }

                    // Handle weather data response - note the field name change from 'data' to 'weather_update'
                    if (data.type === "weather_update") {
                        setWeatherData(data.data); // The actual weather data is in data.data
                        setIsLoadingWeather(false);
                        setCanUpdateWeather(false);

                        const location = data.location ||
                            `${currentLocationRef.current.city}, ${currentLocationRef.current.country}`;

                        setNotifications((prev) => [
                            {
                                type: "success",
                                message: `Weather updated for ${location}`,
                                timestamp: Math.floor(Date.now() / 1000),
                            },
                            ...prev.slice(0, 9),
                        ]);
                        return;
                    }

                    // Handle rate limit error
                    if (data.type === "rate_limited") {
                        setIsLoadingWeather(false);
                        setCanUpdateWeather(false);

                        const location = data.location ||
                            `${currentLocationRef.current.city}, ${currentLocationRef.current.country}`;

                        setNotifications((prev) => [
                            {
                                type: "error",
                                message: `Rate limited for ${location}. You'll be notified when updates are available.`,
                                timestamp: Math.floor(Date.now() / 1000),
                            },
                            ...prev.slice(0, 9),
                        ]);
                        return;
                    }

                    // Handle general errors
                    if (data.type === "error") {
                        console.error("Worker error:", data.message);
                        setIsLoadingWeather(false);

                        setNotifications((prev) => [
                            {
                                type: "error",
                                message: data.message || "Failed to update weather",
                                timestamp: Math.floor(Date.now() / 1000),
                            },
                            ...prev.slice(0, 9),
                        ]);
                        return;
                    }

                } catch (e) {
                    console.error("Error parsing WebSocket message:", e);
                }
            };

            wsRef.current.onclose = (event) => {
                console.log("WebSocket disconnected:", event.code, event.reason);
                setIsConnected(false);
                setIsLoadingWeather(false);
                setCanUpdateWeather(false);

                // Auto-reconnect after 5 seconds
                reconnectTimeoutRef.current = setTimeout(connect, 5000);
            };

            wsRef.current.onerror = (error) => {
                console.error("WebSocket error:", error);
                setIsConnected(false);
                setIsLoadingWeather(false);
                setCanUpdateWeather(false);
            };
        } catch (error) {
            console.error("Failed to connect WebSocket:", error);
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
        setIsLoadingWeather(false);
        setCanUpdateWeather(false);
    }, []);

    const sendMessage = useCallback((message) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
                console.log("Sending message to CloudFlare Worker:", message.action);
                wsRef.current.send(JSON.stringify(message));
                return true;
            } catch (error) {
                console.error("Error sending message:", error);
                return false;
            }
        } else {
            console.error("WebSocket not connected");
            return false;
        }
    }, []);

    const requestWeatherUpdate = useCallback(
        (requestCity, requestCountry) => {
            const targetCity = requestCity || currentLocationRef.current.city;
            const targetCountry = requestCountry || currentLocationRef.current.country;

            if (!isConnected) {
                console.error("Cannot request weather: WebSocket not connected");
                setNotifications((prev) => [
                    {
                        type: "error",
                        message: "Cannot update weather: Not connected to server",
                        timestamp: Math.floor(Date.now() / 1000),
                    },
                    ...prev.slice(0, 9),
                ]);
                return false;
            }

            if (!canUpdateWeather) {
                console.error("Cannot request weather: Rate limit active");
                setNotifications((prev) => [
                    {
                        type: "error",
                        message: `Weather updates are rate limited for ${targetCity}, ${targetCountry}. You'll be notified when available.`,
                        timestamp: Math.floor(Date.now() / 1000),
                    },
                    ...prev.slice(0, 9),
                ]);
                return false;
            }

            setIsLoadingWeather(true);

            // Send weather request to CloudFlare Worker
            const success = sendMessage({
                action: "get_weather",
                city: targetCity,
                country: targetCountry,
                timestamp: Math.floor(Date.now() / 1000),
            });

            if (!success) {
                setIsLoadingWeather(false);
                setNotifications((prev) => [
                    {
                        type: "error",
                        message: "Failed to send weather request",
                        timestamp: Math.floor(Date.now() / 1000),
                    },
                    ...prev.slice(0, 9),
                ]);
            }

            return success;
        },
        [isConnected, canUpdateWeather, sendMessage],
    );

    // Update rate limit status when location changes
    useEffect(() => {
        if (isConnected && city && country) {
            console.log(`Location changed to ${city}, ${country} - checking rate limit status`);

            // Reset canUpdateWeather while checking new location
            setCanUpdateWeather(false);

            sendMessage({
                action: "get_rate_limit_status",
                city: currentLocationRef.current.city,
                country: currentLocationRef.current.country
            });
        }
    }, [city, country, isConnected, sendMessage]);

    // Initial connection
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

    // Helper function to normalize location for comparison
    function normalizeLocation(city, country, locationString) {
        if (locationString) {
            // If we have a location string like "Paris, FR", normalize it
            return locationString.toLowerCase().replace(', ', '_');
        } else if (city && country) {
            // Build from city and country
            return `${city}_${country}`.toLowerCase();
        }
        return 'unknown';
    }

    return {
        isConnected,
        notifications,
        weatherData,
        isLoadingWeather,
        canUpdateWeather,
        clearNotifications,
        sendMessage,
        requestWeatherUpdate,
    };
}
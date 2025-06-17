import React, { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

const WEBSOCKET_URL = 'wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod';

const WeatherTest = () => {
    const [city, setCity] = useState('Paris');
    const [country, setCountry] = useState('FR');

    const {
        isConnected,
        notifications,
        weatherData,
        isLoadingWeather,
        requestWeatherUpdate,
        sendMessage,
        clearNotifications
    } = useWebSocket(WEBSOCKET_URL);

    const handleTestWeather = () => {
        requestWeatherUpdate(city, country);
    };

    const handleTestBroadcast = () => {
        sendMessage({
            action: 'broadcast',
            data: `Test message from ${new Date().toLocaleTimeString()}`
        });
    };

    return (
        <div className="p-6 max-w-2xl mx-auto bg-white rounded-lg shadow-lg">
            <h1 className="text-2xl font-bold mb-6">WebSocket Weather Test</h1>

            {/* Connection Status */}
            <div className={`p-3 rounded mb-4 ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                Status: {isConnected ? 'Connected' : 'Disconnected'}
            </div>

            {/* Weather Request Form */}
            <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3">Test Weather Request</h2>
                <div className="flex gap-4 mb-3">
                    <input
                        type="text"
                        placeholder="City"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="px-3 py-2 border rounded flex-1"
                    />
                    <input
                        type="text"
                        placeholder="Country Code"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="px-3 py-2 border rounded w-24"
                    />
                </div>
                <button
                    onClick={handleTestWeather}
                    disabled={!isConnected || isLoadingWeather}
                    className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                    {isLoadingWeather ? 'Loading...' : 'Get Weather'}
                </button>
            </div>

            {/* Test Broadcast */}
            <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3">Test Broadcast</h2>
                <button
                    onClick={handleTestBroadcast}
                    disabled={!isConnected}
                    className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                    Send Test Message
                </button>
            </div>

            {/* Weather Data Display */}
            {weatherData && (
                <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-3">Current Weather Data</h2>
                    <div className="bg-gray-100 p-4 rounded">
                        <pre className="text-sm overflow-auto">
                            {JSON.stringify(weatherData, null, 2)}
                        </pre>
                    </div>
                </div>
            )}

            {/* Notifications */}
            {notifications.length > 0 && (
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-lg font-semibold">Notifications ({notifications.length})</h2>
                        <button
                            onClick={clearNotifications}
                            className="text-red-500 hover:text-red-700"
                        >
                            Clear All
                        </button>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {notifications.map((notification, idx) => (
                            <div key={idx} className="bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                                <div className="text-sm">
                                    <strong>Type:</strong> {notification.type || 'N/A'}
                                </div>
                                <div className="text-sm">
                                    <strong>Message:</strong> {notification.message || JSON.stringify(notification)}
                                </div>
                                {notification.timestamp && (
                                    <div className="text-xs text-gray-500">
                                        {new Date(notification.timestamp * 1000).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WeatherTest;
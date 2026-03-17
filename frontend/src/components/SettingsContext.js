"use client";

import React, { createContext, useState, useContext, useMemo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

const SettingsContext = createContext();

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within SettingsProvider');
    }
    return context;
}

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;

export function SettingsProvider({ children }) {
    const [theme, setTheme] = useState('blue');

    const [selectedLocation, setSelectedLocation] = useState('Paris, FR');
    const [cachedWeatherData, setCachedWeatherData] = useState(null);
    const [lastUpdated, setLastUpdated] = useState('');
    const currentLocation = useMemo(() => {
        const locationString = cachedWeatherData?.location || selectedLocation;
        const parts = locationString.split(", ");
        return {
            city: parts[0] || "Paris",
            country: parts[1] || "FR"
        };
    }, [cachedWeatherData?.location, selectedLocation]);

    const websocket = useWebSocket(
        WEBSOCKET_URL,
        { city: currentLocation.city, country: currentLocation.country }
    );

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'blue' ? 'dark' : 'blue'));
    };

    const value = {
        theme,
        toggleTheme,
        selectedLocation,
        setSelectedLocation,
        cachedWeatherData,
        setCachedWeatherData,
        lastUpdated,
        setLastUpdated,
        websocket,
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}

export { SettingsContext };
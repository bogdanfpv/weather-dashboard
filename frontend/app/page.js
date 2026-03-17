"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import WeekForecastPanel from '../src/components/WeekForecastPanel';
import ControlPanel from '../src/components/ControlPanel';
import CurrentTemperature from '../src/components/CurrentTemperature';
import WeatherIcon from '../src/components/WeatherIcon';
import Sidebar from '../src/components/Sidebar';
import WeatherHeader from '../src/components/WeatherHeader';
import { useWeatherCache } from '../src/hooks/useWeatherCache';
import WeatherStats from '../src/components/WeatherStats';
import NotificationPanel from '../src/components/NotificationPanel';
import { useSettings } from '../src/components/SettingsContext';

export default function Page() {
    const [currentTime, setCurrentTime] = useState("");
    const [isClient, setIsClient] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);

    const {
        theme,
        selectedLocation,
        setSelectedLocation,
        cachedWeatherData,
        setCachedWeatherData,
        lastUpdated,
        setLastUpdated
    } = useSettings();

    useEffect(() => {
        setIsClient(true);
    }, []);

    const { isLoading, isDataReady } = useWeatherCache(
        selectedLocation,
        setCachedWeatherData,
        setLastUpdated
    );

    // Current location from context (already computed there)
    const currentLocation = useMemo(() => {
        const locationString = cachedWeatherData?.location || selectedLocation;
        const parts = locationString.split(", ");
        return {
            city: parts[0] || "Paris",
            country: parts[1] || "FR"
        };
    }, [cachedWeatherData?.location, selectedLocation]);

    const {
        websocket: {
            isConnected,
            notifications,
            weatherData: liveWeatherData,
            isLoadingWeather,
            canUpdateWeather,
            nextUpdateTime,
            clearNotifications,
            requestWeatherUpdate,
        }
    } = useSettings();

    const nextUpdateFormatted = useMemo(() => {
        if (!nextUpdateTime) return null;

        const nextUpdate = new Date(nextUpdateTime);
        const now = new Date();
        const diffMs = nextUpdate - now;
        const diffMinutes = Math.floor(diffMs / 60000);
        if (diffMinutes < 0) {
            return null;
        }

        if (diffMinutes < 1) return "Less than a minute";
        if (diffMinutes === 1) return "1 minute";
        if (diffMinutes < 60) return `${diffMinutes} minutes`;

        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        if (hours === 1 && mins === 0) return "1 hour";
        if (mins === 0) return `${hours} hours`;
        return `${hours}h ${mins}m`;
    }, [nextUpdateTime]);

    useEffect(() => {
        if (liveWeatherData) {
            setCachedWeatherData(liveWeatherData);
            setLastUpdated(new Date().toLocaleTimeString());
        }
    }, [liveWeatherData, setCachedWeatherData, setLastUpdated]);

    useEffect(() => {
        if (!isClient) return;

        const updateTime = () => {
            const now = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            });
            setCurrentTime(now);
            if (!lastUpdated) {
                setLastUpdated(now);
            }
        };

        updateTime();
        const timer = setInterval(updateTime, 60000);
        return () => clearInterval(timer);
    }, [isClient, lastUpdated, setLastUpdated]);

    const wakeLockRef = useRef(null);

    useEffect(() => {
        if (!isClient) return;

        const requestWakeLock = async () => {
            try {
                wakeLockRef.current = await navigator.wakeLock.request("screen");
                console.log("Wake Lock acquired");
            } catch (err) {
                console.error("Wake Lock error:", err.message);
                wakeLockRef.current = null;
            }
        };

        if ("wakeLock" in navigator) {
            requestWakeLock().catch((err) => {
                console.error("Failed to request initial wake lock:", err);
            });

            const handleVisibilityChange = () => {
                if (document.visibilityState === "visible" && !wakeLockRef.current) {
                    requestWakeLock().catch((err) => {
                        console.error(
                            "Failed to request wake lock on visibility change:",
                            err,
                        );
                    });
                }
            };

            document.addEventListener("visibilitychange", handleVisibilityChange);

            return () => {
                document.removeEventListener(
                    "visibilitychange",
                    handleVisibilityChange,
                );
                if (wakeLockRef.current) {
                    wakeLockRef.current
                        .release()
                        .catch((err) => console.error("Error releasing wake lock:", err));
                }
            };
        }
    }, [isClient]);

    const handleRefreshWeather = async () => {
        if (isConnected && !isLoadingWeather && canUpdateWeather) {
            requestWeatherUpdate(currentLocation.city, currentLocation.country);
        }
    };

    const locationDropdownRef = useRef(null);
    useEffect(() => {
        if (!isClient) return;

        const handleClickOutside = (event) => {
            if (
                locationDropdownRef.current &&
                !locationDropdownRef.current.contains(event.target)
            ) {
                setIsLocationDropdownOpen(false);
            }
        };

        const handleResize = () => {
            setIsLocationDropdownOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("resize", handleResize);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("resize", handleResize);
        };
    }, [isClient]);

    useEffect(() => {
        // Only request via WebSocket if:
        // 1. Cache check is complete (!isLoading)
        // 2. Cache is empty (!cachedWeatherData)
        // 3. WebSocket is connected
        // 4. Rate limit allows it (canUpdateWeather === true)
        if (!isLoading && !cachedWeatherData && isConnected && canUpdateWeather) {
            console.log("Cache is empty and rate limit allows - requesting fresh data via WebSocket...");
            requestWeatherUpdate(currentLocation.city, currentLocation.country);
        }
    }, [isLoading, cachedWeatherData, isConnected, canUpdateWeather, requestWeatherUpdate, currentLocation.city, currentLocation.country]);

    if (!cachedWeatherData && !liveWeatherData) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800 flex items-center justify-center">
                <div className="text-white text-xl">
                    {isLoading ? "Checking cache..." :
                        isLoadingWeather ? "Fetching fresh weather data..." :
                            !isConnected ? "Connecting to weather service..." :
                                !canUpdateWeather ? "Rate limited - waiting for next update..." :
                                    "Loading weather data..."}
                </div>
            </div>
        );
    }

    return (
        <div className={`flex min-h-screen ${theme === 'blue' ? 'bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800' : 'bg-gradient-to-b from-gray-900 via-gray-800 to-black'}`}>
            <NotificationPanel
                notifications={notifications}
                clearNotifications={clearNotifications}
            />

            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <Sidebar
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
            />

            <div className="container mx-auto px-4 py-6 max-w-6xl">
                <header className="text-center mb-6">
                    <WeatherHeader
                        locationDropdownRef={locationDropdownRef}
                        cachedWeatherData={cachedWeatherData}
                        isConnected={isConnected}
                        currentTime={currentTime}
                        setIsSidebarOpen={setIsSidebarOpen}
                        isClient={isClient}
                        setIsLocationDropdownOpen={setIsLocationDropdownOpen}
                        isLocationDropdownOpen={isLocationDropdownOpen}
                        onLocationChange={setSelectedLocation}
                        selectedLocation={selectedLocation}
                    />
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    <CurrentTemperature cachedWeatherData={cachedWeatherData} />
                    <WeatherStats weatherData={cachedWeatherData} />
                </div>

                <div className="hidden md:block mb-6">
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
                        <h2 className="text-white text-xl font-medium mb-4">
                            Today's Weather
                        </h2>
                        <div className="grid grid-cols-7 gap-4">
                            {(cachedWeatherData?.hourly || []).map((hour, idx) => (
                                <div key={idx} className="text-center text-white">
                                    <p className="text-sm text-blue-100 mb-2">{hour.time}</p>
                                    <div className="flex justify-center mb-2">
                                        <WeatherIcon condition={hour.icon} />
                                    </div>
                                    <p className="font-medium">{hour.temp}°</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <WeekForecastPanel cachedWeatherData={cachedWeatherData} />

                <ControlPanel
                    isConnected={isConnected}
                    isLoadingWeather={isLoadingWeather}
                    canUpdateWeather={canUpdateWeather}
                    nextUpdateTime={nextUpdateTime}
                    nextUpdateFormatted={nextUpdateFormatted}
                    clearNotifications={clearNotifications}
                    handleRefreshWeather={handleRefreshWeather}
                    lastUpdated={lastUpdated}
                    notifications={notifications}
                    isClient={isClient}
                />

                <footer className="text-center mt-8 text-blue-100 text-sm">
                    <p>
                        Live weather updates via WebSocket • Powered by OpenWeatherMap API
                    </p>
                </footer>
            </div>
        </div>
    );
}
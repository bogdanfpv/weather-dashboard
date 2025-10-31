"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import WeekForecastPanel from "./WeekForecastPanel";
import ControlPanel from "./ControlPanel";
import CurrentTemperature from "./CurrentTemperature";
import WeatherIcon from "./WeatherIcon";
import Sidebar from "./Sidebar";
import WeatherHeader from "./WeatherHeader";
import { useWeatherCache } from "../hooks/useWeatherCache";
import { useWebSocket } from "../hooks/useWebSocket";
import WeatherStats from "./WeatherStats";
import NotificationPanel from "./NotificationPanel";

const WEBSOCKET_URL =
    "wss://weather-websocket-gate.texidev.cc";

const WeatherApp = () => {
    const [currentTime, setCurrentTime] = useState("");
    const [isClient, setIsClient] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState("Paris, FR");

    // Set isClient to true after component mounts
    useEffect(() => {
        setIsClient(true);
    }, []);

    const {
        cachedWeatherData,
        setCachedWeatherData,
        isLoading,
        isDataReady,
        lastUpdated,
        setLastUpdated,
    } = useWeatherCache(selectedLocation);

    // Parse current location from cached data
    const currentLocation = useMemo(() => {
        if (!cachedWeatherData?.location) {
            return { city: "Paris", country: "FR" };
        }
        const parts = cachedWeatherData.location.split(", ");
        return {
            city: parts[0] || "Paris",
            country: parts[1] || "FR"
        };
    }, [cachedWeatherData?.location]);

    const locationParts = (cachedWeatherData?.location || "Loading...").split(", ");

    const {
        isConnected,
        notifications,
        weatherData: liveWeatherData,
        isLoadingWeather,
        canUpdateWeather,
        clearNotifications,
        requestWeatherUpdate,
    } = useWebSocket(
        WEBSOCKET_URL,
        { city: currentLocation.city, country: currentLocation.country }
    );

    // Update weather data when live data is received
    useEffect(() => {
        if (liveWeatherData) {
            setCachedWeatherData(liveWeatherData);
            setLastUpdated(new Date().toLocaleTimeString());
        }
    }, [liveWeatherData, setCachedWeatherData, setLastUpdated]);

    // Update time after client mount
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
            // Pass current location to the request
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
    <div className="flex min-h-screen bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800">
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
};

export default WeatherApp;

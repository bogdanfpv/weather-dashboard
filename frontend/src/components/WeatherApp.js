"use client";

import React, { useState, useEffect, useRef } from "react";
import WeekForecastPanel from "./WeekForecastPanel";
import ControlPanel from "./ControlPanel";
import CurrentTemperature from "./CurrentTemperature";
import WeatherIcon, { mapOpenWeatherCondition } from "./WeatherIcon";

import {
  Menu,
  ChevronDown
} from "lucide-react";
import { Bell, X } from "lucide-react";
import { useWebSocket } from "../hooks/useWebSocket";
import WeatherStats from "./WeatherStats";

const WEBSOCKET_URL =
    "wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod";

const WeatherApp = () => {
  const [cachedWeatherData, setCachedWeatherData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false); // Add this state
  const [currentTime, setCurrentTime] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);

  // Safe location parsing with fallbacks
  const location = (cachedWeatherData?.location || "Loading...").split(", ");
  const city = location[0] || "Paris";
  const country = location[1] || "FR";

  // WebSocket hook with conditional connection
  const {
    isConnected,
    notifications,
    weatherData: liveWeatherData,
    isLoadingWeather,
    canUpdateWeather,
    nextUpdateTime,
    clearNotifications,
    requestWeatherUpdate,
  } = useWebSocket(
      isDataReady ? "wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod" : null,
      { defaultCity: city, defaultCountry: country }
  );

  // Fetch cached weather immediately on mount
  useEffect(() => {
    setIsClient(true);

    const fetchCachedWeather = async () => {
      try {
        console.log('Fetching cached weather...');

        const response = await fetch(`/api/get-cached-weather?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });

        if (response.ok) {
          const responseData = await response.json();
          const { data, lastUpdated } = responseData;

          if (data && data.current) {
            setCachedWeatherData(data);
            setLastUpdated(new Date(lastUpdated).toLocaleTimeString());
            setIsDataReady(true); // Enable WebSocket connection
            console.log('Weather data set successfully');
          }
        }
      } catch (error) {
        console.error("Failed to fetch cached weather data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCachedWeather();
  }, []);

  // Update weather data when live data is received
  useEffect(() => {
    if (liveWeatherData) {
      setCachedWeatherData(liveWeatherData);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  }, [liveWeatherData]);

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
  }, [isClient, lastUpdated]);

  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!isClient) return;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        console.log("Wake Lock error:", err.message);
      }
    };

    if (typeof window !== "undefined" && "wakeLock" in navigator) {
      requestWakeLock();

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible" && !wakeLockRef.current) {
          requestWakeLock();
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        if (wakeLockRef.current) {
          wakeLockRef.current.release();
        }
      };
    }
  }, [isClient]);

  // Periodic weather updates
  useEffect(() => {
    if (!isClient) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/get-cached-weather");
        if (response.ok) {
          const { data, lastUpdated } = await response.json();
          if (data) {
            setCachedWeatherData(data);
            setLastUpdated(new Date(lastUpdated).toLocaleTimeString());
          }
        }
      } catch (error) {
        console.error("Failed to fetch cached weather data:", error);
      }
    }, 60 * 60 * 1000); // 1 hour

    return () => clearInterval(interval);
  }, [isClient]);

  const handleRefreshWeather = async () => {
    if (isConnected && !isLoadingWeather && canUpdateWeather) {
      requestWeatherUpdate();
    }
  };

  const locationDropdownRef = useRef(null);
  useEffect(() => {
    if (!isClient) return;

    const handleClickOutside = (event) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target)) {
        setIsLocationDropdownOpen(false);
      }
    };

    const handleResize = () => {
      setIsLocationDropdownOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleResize);
    };
  }, [isClient]);

  const NotificationPanel = () => {
    if (!isClient || notifications.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {notifications.slice(0, 3).map((notification, idx) => (
              <div
                  key={`${notification.timestamp}-${idx}`}
                  className="bg-white/90 backdrop-blur-md rounded-lg p-4 shadow-lg border border-white/20 animate-slide-in"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <Bell className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {notification.type === "weather_alert"
                            ? "Weather Alert"
                            : "Notification"}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.message}
                      </p>
                      {notification.timestamp && (
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(notification.timestamp * 1000).toLocaleTimeString()}
                          </p>
                      )}
                    </div>
                  </div>
                  <button
                      onClick={clearNotifications}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
          ))}
        </div>
    );
  };

  // Show loading until Redis data is fetched
  if (isLoading || !cachedWeatherData || !cachedWeatherData.current) {
    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800 flex items-center justify-center">
          <div className="text-white text-xl">Loading weather data...</div>
        </div>
    );
  }

  return (
      <div className="flex min-h-screen bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800">
        <NotificationPanel />

        {/* Backdrop overlay */}
        {isSidebarOpen && (
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setIsSidebarOpen(false)}
            />
        )}

        {/* Sidebar */}
        <div
            data-testid="sidebar"
            className={`
    fixed inset-y-0 left-0 z-50 w-64 bg-white/10 backdrop-blur-md border-r border-white/20 p-6 transform transition-transform duration-300 ease-in-out flex flex-col
    ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
`}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white">WeatherApp</h2>
            <button
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden text-white hover:bg-white/20 p-1 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-2 flex-1">
            <button
                type="button"
                className="block text-white hover:bg-white/20 px-3 py-2 rounded-lg transition-colors w-full text-left"
            >
              Dashboard
            </button>
            <button
                type="button"
                className="block text-white hover:bg-white/20 px-3 py-2 rounded-lg transition-colors w-full text-left"
            >
              Forecast
            </button>
            <button
                type="button"
                className="block text-white hover:bg-white/20 px-3 py-2 rounded-lg transition-colors w-full text-left"
            >
              Settings
            </button>
          </nav>

          {/* Greyed out buttons that require login */}
          <div className="mt-auto pt-4 space-y-2">
            <button
                type="button"
                className="block text-white/40 px-3 py-2 rounded-lg w-full text-left cursor-not-allowed"
                disabled
            >
              Historical Data
            </button>
            <button
                type="button"
                className="block text-white/40 px-3 py-2 rounded-lg w-full text-left cursor-not-allowed"
                disabled
            >
              Saved Locations
            </button>
            <button
                type="button"
                className="block text-white/40 px-3 py-2 rounded-lg w-full text-left cursor-not-allowed"
                disabled
            >
              Weather Alerts
            </button>
          </div>

          {/* Login button at bottom */}
          <div className="mt-auto pt-4 border-t border-white/20">
            <button
                type="button"
                className="block text-white hover:bg-white/20 px-3 py-2 rounded-lg transition-colors w-full text-left font-medium"
            >
              Login
            </button>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-6xl">
          {/* Header */}
          <header className="text-center mb-6">
            <div className="flex items-center justify-between mb-4">
              <button
                  aria-label="menu"
                  onClick={() => setIsSidebarOpen(true)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>

              <div className="flex items-center justify-center space-x-2 flex-1">
                <h1 className="text-white text-2xl md:text-3xl font-light" data-testid="location-display">
                  {cachedWeatherData.location}
                  {isClient && currentTime && ` • ${currentTime}`}
                </h1>
                <div
                    className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
                    title={isConnected ? "Live updates connected" : "Live updates disconnected"}
                />
                <div className="relative" ref={locationDropdownRef}>
                  <button
                      onClick={() => setIsLocationDropdownOpen(!isLocationDropdownOpen)}
                      className="text-white hover:bg-white/20 p-1 rounded transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {isLocationDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 py-2 min-w-[160px] z-50">
                        <button
                            onClick={() => {
                              // Add your location change logic here for Helsinki
                              setIsLocationDropdownOpen(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-white hover:bg-white/20 transition-colors"
                        >
                          Helsinki, FI
                        </button>
                        <button
                            onClick={() => {
                              // Add your location change logic here for Washington DC
                              setIsLocationDropdownOpen(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-white hover:bg-white/20 transition-colors"
                        >
                          Washington DC, US
                        </button>
                      </div>
                  )}
                </div>
              </div>

              <div className="w-10"></div>
            </div>
            <p className="text-blue-100 text-sm" data-testid="date-display">{cachedWeatherData.date}</p>
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
                {(cachedWeatherData.hourly || []).map((hour, idx) => (
                    <div key={idx} className="text-center text-white">
                      <p className="text-sm text-blue-100 mb-2">{hour.time}</p>
                      <div className="flex justify-center mb-2">
                        <WeatherIcon condition={hour.icon}/>
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
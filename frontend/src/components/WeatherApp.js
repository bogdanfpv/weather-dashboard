"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Menu,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Eye,
  Droplets,
  Thermometer,
  Sunrise,
  Sunset,
  RefreshCw,
  Loader2,
  ChevronDown
} from "lucide-react";
import { Bell, X } from "lucide-react";
import { useWebSocket } from "../hooks/useWebSocket";

// Temporary placeholders for missing components
const WeatherStats = ({ weatherData }) => (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white">
      <h3 className="text-lg font-medium mb-4">Weather Stats</h3>
      <div className="space-y-3">
        <div className="flex justify-between">
          <span>Sunrise:</span>
          <span>{weatherData?.current?.sunrise || "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span>Sunset:</span>
          <span>{weatherData?.current?.sunset || "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span>Humidity:</span>
          <span>{weatherData?.current?.humidity || "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span>Pressure:</span>
          <span>{weatherData?.current?.pressure || "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span>Visibility:</span>
          <span>{weatherData?.current?.visibility || "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span>UV Index:</span>
          <span>{weatherData?.current?.uvIndex || "N/A"}</span>
        </div>
      </div>
    </div>
);

const WeatherIcon = ({ condition, size = "w-6 h-6" }) => {
  const iconMap = {
    clear: Sun,
    cloudy: Cloud,
    rain: CloudRain,
    snow: CloudSnow,
  };

  const IconComponent = iconMap[condition] || Sun;
  return <IconComponent className={`${size} text-yellow-300`} />;
};

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
      // Only use WebSocket - it already updates Redis
      requestWeatherUpdate();

      // Remove the redundant API calls that are causing 504 timeout
      // The WebSocket already handles:
      // 1. Fetching fresh weather data
      // 2. Updating Redis cache
      // 3. Sending updated data back to client
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

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Current Temperature */}
            <div className="lg:col-span-2">
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 text-center text-white h-full">
                <div className="flex items-center justify-center mb-4">
                  <WeatherIcon
                      condition={cachedWeatherData.current.sky || "clear"}
                      size="w-20 h-20 md:w-24 md:w-24"
                  />
                </div>
                <div className="text-6xl md:text-7xl font-thin mb-2" data-testid="main-temperature">
                  {cachedWeatherData.current.temp || 0}°
                </div>
                <p className="text-xl md:text-2xl text-blue-100 mb-6" data-testid="weather-condition">
                  {cachedWeatherData.current.condition || "Loading..."}
                </p>
                {/* Quick Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex flex-col items-center">
                    <Thermometer className="w-5 h-5 mb-1 text-red-300" />
                    <span className="text-blue-100">High</span>
                    <span className="font-medium" data-testid="high-temp">
  {cachedWeatherData.current.high || 0}°
</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Thermometer className="w-5 h-5 mb-1 text-blue-300" />
                    <span className="text-blue-100">Low</span>
                    <span className="font-medium" data-testid="low-temp">
  {cachedWeatherData.current.low || 0}°
</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Wind className="w-5 h-5 mb-1 text-gray-300" />
                    <span className="text-blue-100">Wind</span>
                    <span className="font-medium" data-testid="wind-speed">
  {cachedWeatherData.current.wind || "N/A"}
</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Droplets className="w-5 h-5 mb-1 text-blue-300" />
                    <span className="text-blue-100">Sky</span>
                    <span className="font-medium" data-testid="sky-condition">
  {cachedWeatherData.current.sky || "N/A"}
</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Weather Stats */}
            <WeatherStats weatherData={cachedWeatherData} />
          </div>

          {/* Hourly Forecast */}
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
                        <WeatherIcon condition={hour.icon} size="w-6 h-6" />
                      </div>
                      <p className="font-medium">{hour.temp}°</p>
                    </div>
                ))}
              </div>
            </div>
          </div>

          {/* 5-Day Forecast */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
            <h2 className="text-white text-xl font-medium mb-4">Next 5 Days</h2>

            {/* Mobile Layout - Cards */}
            <div className="md:hidden space-y-3">
              {(cachedWeatherData.daily || []).map((day, idx) => (
                  <div
                      key={idx}
                      className="flex items-center justify-between py-3 border-b border-white/10 last:border-b-0"
                  >
                    <div className="flex items-center space-x-3">
                      <WeatherIcon condition={day.icon} size="w-8 h-8" />
                      <div>
                        <p className="text-white font-medium">{day.day}</p>
                        <p className="text-blue-100 text-sm">{day.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-medium">
                        {day.low}-{day.high}°
                      </p>
                      <p className="text-blue-100 text-sm">{day.rain} rain</p>
                    </div>
                  </div>
              ))}
            </div>

            {/* Desktop Layout - Table */}
            <div className="hidden md:block">
              <div className="grid grid-cols-6 gap-4 text-white">
                <div className="font-medium text-blue-100">Day</div>
                <div className="font-medium text-blue-100">Condition</div>
                <div className="font-medium text-blue-100">Low</div>
                <div className="font-medium text-blue-100">High</div>
                <div className="font-medium text-blue-100">Wind</div>
                <div className="font-medium text-blue-100">Rain</div>

                {(cachedWeatherData.daily || []).map((day, idx) => (
                    <React.Fragment key={idx}>
                      <div className="py-3 border-b border-white/10">
                        <p className="font-medium">{day.day}</p>
                        <p className="text-blue-100 text-sm">{day.date}</p>
                      </div>
                      <div className="py-3 border-b border-white/10 flex items-center space-x-2">
                        <WeatherIcon condition={day.icon} size="w-5 h-5" />
                        <span className="capitalize">{day.icon}</span>
                      </div>
                      <div className="py-3 border-b border-white/10">
                        {day.low}°
                      </div>
                      <div className="py-3 border-b border-white/10">
                        {day.high}°
                      </div>
                      <div className="py-3 border-b border-white/10">
                        {day.wind}
                      </div>
                      <div className="py-3 border-b border-white/10">
                        {day.rain}
                      </div>
                    </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Control Panel */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mt-6">
            <h2 className="text-white text-xl font-medium mb-4">
              Live Weather Controls
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
              <div className="flex items-center space-x-4">
                <div
                    className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                        isConnected
                            ? "bg-green-500/20 text-green-300"
                            : "bg-red-500/20 text-red-300"
                    }`}
                >
                  <div
                      className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
                  />
                  <span>{isConnected ? "Connected" : "Disconnected"}</span>
                </div>
                {isClient && lastUpdated && (
                    <span className="text-blue-100 text-sm">
                  Last updated: {lastUpdated}
                </span>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                    onClick={handleRefreshWeather}
                    disabled={!isConnected || isLoadingWeather || !canUpdateWeather}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                        !isConnected || isLoadingWeather || !canUpdateWeather
                            ? "bg-gray-500/20 text-gray-400 cursor-not-allowed"
                            : "bg-white/20 hover:bg-white/30 text-white"
                    }`}
                >
                  {isLoadingWeather ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                      <RefreshCw className="w-4 h-4" />
                  )}
                  <span>
                  {isLoadingWeather
                      ? "Updating..."
                      : !canUpdateWeather
                          ? nextUpdateTime
                              ? `Available at ${new Date(nextUpdateTime * 1000).toLocaleTimeString()}`
                              : "Updates rate limited"
                          : "Update Weather"}
                </span>
                </button>

                {notifications.length > 0 && (
                    <button
                        onClick={clearNotifications}
                        className="flex items-center space-x-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 px-4 py-2 rounded-lg transition-colors"
                    >
                      <Bell className="w-4 h-4" />
                      <span>Clear ({notifications.length})</span>
                    </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
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
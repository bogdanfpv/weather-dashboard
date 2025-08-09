"use client";

import React, { useState, useEffect, useRef } from "react";
import WeekForecastPanel from "./WeekForecastPanel";
import ControlPanel from "./ControlPanel";
import CurrentTemperature from "./CurrentTemperature";
import WeatherIcon from "./WeatherIcon";
import Sidebar from "./Sidebar";
import WeatherHeader from "./WeatherHeader";

import { Menu, ChevronDown } from "lucide-react";
import { useWebSocket } from "../hooks/useWebSocket";
import WeatherStats from "./WeatherStats";
import NotificationPanel from "./NotificationPanel";

const WEBSOCKET_URL =
  "wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod";

const WeatherApp = () => {
  const [cachedWeatherData, setCachedWeatherData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);

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
    isDataReady
      ? "wss://e9z9tauxbc.execute-api.eu-north-1.amazonaws.com/Prod"
      : null,
    { defaultCity: city, defaultCountry: country },
  );

  // Fetch cached weather immediately on mount
  useEffect(() => {
    setIsClient(true);

    const fetchCachedWeather = async () => {
      try {
        console.log("Fetching cached weather...");

        const response = await fetch(
          `/api/get-cached-weather?t=${Date.now()}`,
          {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
            },
          },
        );

        if (response.ok) {
          const responseData = await response.json();
          const { data, lastUpdated } = responseData;

          if (data && data.current) {
            setCachedWeatherData(data);
            setLastUpdated(new Date(lastUpdated).toLocaleTimeString());
            setIsDataReady(true); // Enable WebSocket connection
            console.log("Weather data set successfully");
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

  // Periodic weather updates
  useEffect(() => {
    if (!isClient) return;

    const interval = setInterval(
      async () => {
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
      },
      60 * 60 * 1000,
    );

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

  if (isLoading || !cachedWeatherData || !cachedWeatherData.current) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading weather data...</div>
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
              {(cachedWeatherData.hourly || []).map((hour, idx) => (
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

"use client";
import React from "react";
import { ChevronDown } from "lucide-react";
import SidebarToggleButton from "./SidebarToggleButton";

const WeatherHeader = ({
                           locationDropdownRef,
                           cachedWeatherData,
                           isConnected,
                           currentTime,
                           setIsSidebarOpen,
                           isClient,
                           setIsLocationDropdownOpen,
                           isLocationDropdownOpen,
                           onLocationChange,
                           selectedLocation,
                       }) => {
  if (
    !cachedWeatherData ||
    !currentTime ||
    !setIsSidebarOpen ||
    !setIsLocationDropdownOpen ||
    !locationDropdownRef  ||
    !onLocationChange ||
    !selectedLocation
  )
    return null;

  const cities = [
    { name: "Paris, FR", value: "Paris, FR" },
    { name: "London, GB", value: "London, GB" },
    { name: "Tokyo, JP", value: "Tokyo, JP" },
    { name: "Sydney, AU", value: "Sydney, AU" },
    { name: "Washington DC, US", value: "Washington, US" },
    { name: "Helsinki, FI", value: "Helsinki, FI" },
    { name: "Mumbai, IN", value: "Mumbai, IN" },
    { name: "Dubai, AE", value: "Dubai, AE" },
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <SidebarToggleButton setIsSidebarOpen={setIsSidebarOpen} />

        <div className="flex items-center justify-center space-x-2 flex-1">
          <h1
            className="text-white text-2xl md:text-3xl font-light"
            data-testid="location-display"
          >
            {cachedWeatherData.location}
            {isClient && currentTime && ` • ${currentTime}`}
          </h1>
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
            title={
              isConnected
                ? "Live updates connected"
                : "Live updates disconnected"
            }
          />
          <div className="relative" ref={locationDropdownRef}>
            <button
              onClick={() => setIsLocationDropdownOpen(!isLocationDropdownOpen)}
              className="text-white hover:bg-white/20 p-1 rounded transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {isLocationDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 py-2 min-w-[160px] z-50 max-h-[300px] overflow-y-auto">
                {cities.map((city) => (
                  <button
                    key={city.value}
                    onClick={() => {
                      onLocationChange(city.value);
                      setIsLocationDropdownOpen(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-white hover:bg-white/20 transition-colors ${
                      selectedLocation === city.value ? "bg-white/20" : ""
                    }`}
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="w-10"></div>
      </div>
      <p className="text-blue-100 text-sm" data-testid="date-display">
        {cachedWeatherData.date}
      </p>
    </>
  );
};

export default WeatherHeader;
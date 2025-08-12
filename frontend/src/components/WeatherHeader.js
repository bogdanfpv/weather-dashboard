"use client";
import React from "react";
import { Menu, ChevronDown } from "lucide-react";

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
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <button
          aria-label="menu"
          onClick={() => setIsSidebarOpen(true)}
          className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>

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
              <div className="absolute top-full left-0 mt-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 py-2 min-w-[160px] z-50">
                  <button
                      onClick={() => {
                          onLocationChange("Helsinki, FI");
                          setIsLocationDropdownOpen(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-white hover:bg-white/20 transition-colors ${
                          selectedLocation === "Helsinki, FI" ? "bg-white/20" : ""
                      }`}
                  >
                      Helsinki, FI
                  </button>
                  <button
                      onClick={() => {
                          onLocationChange("Washington DC, US");
                          setIsLocationDropdownOpen(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-white hover:bg-white/20 transition-colors ${
                          selectedLocation === "Washington DC, US" ? "bg-white/20" : ""
                      }`}
                  >
                      Washington DC, US
                  </button>
              </div>
            )}
          </div>
        </div>
        <div className="w-10"></div>
      </div>
      <p className="text-blue-100 text-sm" data-testid="date-display">
        {cachedWeatherData.date}
      </p>{" "}
    </>
  );
};

export default WeatherHeader;

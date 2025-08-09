"use client";

import React from "react";
import { Loader2, RefreshCw, Bell } from "lucide-react";

const ControlPanel = ({
  isConnected,
  isLoadingWeather,
  canUpdateWeather,
  nextUpdateTime,
  clearNotifications,
  handleRefreshWeather,
  lastUpdated,
  notifications,
  isClient = false,
}) => {
  return (
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
  );
};

export default ControlPanel;

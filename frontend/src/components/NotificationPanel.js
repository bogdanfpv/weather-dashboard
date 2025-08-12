"use client";

import { Bell, X } from "lucide-react";
import React from "react";

const NotificationPanel = ({ notifications, clearNotifications }) => {
  if (!notifications || notifications.length === 0 || !clearNotifications)
    return null;

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
                    {new Date(
                      notification.timestamp * 1000,
                    ).toLocaleTimeString()}
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

export default NotificationPanel;

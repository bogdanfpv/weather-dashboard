"use client";

import React from "react";
import WeatherIcon from "./WeatherIcon";

const WeekForecastPanel = ({ cachedWeatherData }) => {
  return (
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
              <div className="py-3 border-b border-white/10">{day.low}°</div>
              <div className="py-3 border-b border-white/10">{day.high}°</div>
              <div className="py-3 border-b border-white/10">{day.wind}</div>
              <div className="py-3 border-b border-white/10">{day.rain}</div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekForecastPanel;

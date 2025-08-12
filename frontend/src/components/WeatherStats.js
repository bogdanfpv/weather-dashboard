import React from "react";
import { Sunrise, Sunset, Eye, Droplets } from "lucide-react";

const WeatherStats = ({ weatherData }) => {
  if (!weatherData || !weatherData.current) return null;
  return (
    <div className="space-y-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white">
        <h3 className="text-lg font-medium mb-4">Sun Times</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sunrise className="w-5 h-5 text-yellow-400" />
              <span className="text-blue-100">Sunrise</span>
            </div>
            <span className="font-medium">{weatherData.current.sunrise}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sunset className="w-5 h-5 text-orange-400" />
              <span className="text-blue-100">Sunset</span>
            </div>
            <span className="font-medium">{weatherData.current.sunset}</span>
          </div>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white">
        <h3 className="text-lg font-medium mb-4">Details</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4 text-blue-300" />
              <span className="text-blue-100">Visibility</span>
            </div>
            <span>{weatherData.current.visibility}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Droplets className="w-4 h-4 text-blue-300" />
              <span className="text-blue-100">Humidity</span>
            </div>
            <span>{weatherData.current.humidity}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-blue-100">Pressure</span>
            <span>{weatherData.current.pressure}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-blue-100">UV Index</span>
            <span>{weatherData.current.uvIndex}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherStats;

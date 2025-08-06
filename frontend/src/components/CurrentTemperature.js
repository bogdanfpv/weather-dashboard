'use client';
import React from 'react';
import WeatherIcon from './WeatherIcon';
import { Thermometer, Wind, Droplets } from 'lucide-react';

const CurrentTemperature = ({ cachedWeatherData }) => { return (

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
</div> );};

    export default CurrentTemperature;
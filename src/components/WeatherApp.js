import React, { useState, useEffect, useRef } from 'react';
import { Sun, Cloud, CloudRain, CloudSnow, Wind, Eye, Droplets, Thermometer, Sunrise, Sunset } from 'lucide-react';
import WeatherStats from './WeatherStats';
import WeatherIcon from './WeatherIcon';

const WeatherApp = () => {
    // Mock weather data - in production this would come from your API
    const [weatherData, setWeatherData] = useState({
        location: "Paris, FR",
        date: "Monday 29 August",
        current: {
            temp: 21,
            condition: "Mostly sunny",
            high: 23,
            low: 14,
            wind: "7mph",
            rain: "0%",
            sunrise: "05:27",
            sunset: "20:57",
            visibility: "10km",
            humidity: "65%",
            pressure: "1013mb",
            uvIndex: "6"
        },
        hourly: [
            { time: "3am", temp: 14, icon: "clear" },
            { time: "6am", temp: 16, icon: "clear" },
            { time: "9am", temp: 17, icon: "clear" },
            { time: "12pm", temp: 19, icon: "clear" },
            { time: "3pm", temp: 21, icon: "clear" },
            { time: "6pm", temp: 20, icon: "clear" },
            { time: "9pm", temp: 18, icon: "clear" }
        ],
        daily: [
            { day: "Tue", date: "30/7", low: 10, high: 21, wind: "12mph", rain: "0%", icon: "clear" },
            { day: "Wed", date: "31/7", low: 9, high: 18, wind: "7mph", rain: "3%", icon: "cloudy" },
            { day: "Thu", date: "1/8", low: 7, high: 15, wind: "11mph", rain: "75%", icon: "rain" },
            { day: "Fri", date: "2/8", low: 10, high: 21, wind: "3mph", rain: "5%", icon: "clear" },
            { day: "Sat", date: "3/8", low: 12, high: 24, wind: "8mph", rain: "2%", icon: "clear" }
        ]
    });

    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

    useEffect(() => {
        // Set time immediately when component mounts
        setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        // Update time every 60 seconds
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString());
        }, 60000);

        // Cleanup interval on unmount
        return () => clearInterval(timer);
    }, []); // Empty dependency array means the interval is only set once when the component mounts

    const wakeLockRef = useRef(null);

    useEffect(() => {
        const requestWakeLock = async () => {
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.log('Wake Lock error:', err.message);
            }
        };

        if ('wakeLock' in navigator) {
            requestWakeLock();

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && !wakeLockRef.current) {
                    requestWakeLock();
                }
            });
        }

        return () => {
            if (wakeLockRef.current) {
                wakeLockRef.current.release();
            }
        };
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800">
            <div className="container mx-auto px-4 py-6 max-w-6xl">

                {/* Header */}
                <header className="text-center mb-6">
                    <h1 className="text-white text-2xl md:text-3xl font-light mb-2">
                        {weatherData.location} • {currentTime}
                    </h1>
                    <p className="text-blue-100 text-sm">{weatherData.date}</p>
                </header>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

                    {/* Current Temperature - Takes full width on mobile, 2 cols on desktop */}
                    <div className="lg:col-span-2">
                        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 text-center text-white h-full">
                            <div className="flex items-center justify-center mb-4">
                                <WeatherIcon condition="clear" size="w-20 h-20 md:w-24 md:w-24" />
                            </div>
                            <div className="text-6xl md:text-7xl font-thin mb-2">
                                {weatherData.current.temp}°
                            </div>
                            <p className="text-xl md:text-2xl text-blue-100 mb-6">
                                {weatherData.current.condition}
                            </p>

                            {/* Quick Stats Row */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div className="flex flex-col items-center">
                                    <Thermometer className="w-5 h-5 mb-1 text-red-300" />
                                    <span className="text-blue-100">High</span>
                                    <span className="font-medium">{weatherData.current.high}°</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <Thermometer className="w-5 h-5 mb-1 text-blue-300" />
                                    <span className="text-blue-100">Low</span>
                                    <span className="font-medium">{weatherData.current.low}°</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <Wind className="w-5 h-5 mb-1 text-gray-300" />
                                    <span className="text-blue-100">Wind</span>
                                    <span className="font-medium">{weatherData.current.wind}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <Droplets className="w-5 h-5 mb-1 text-blue-300" />
                                    <span className="text-blue-100">Rain</span>
                                    <span className="font-medium">{weatherData.current.rain}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Weather Stats - Takes full width on mobile, 1 col on desktop */}
                    <WeatherStats weatherData={weatherData} />

                </div>

                {/* Hourly Forecast - Hidden on mobile, shown on tablet+ */}
                <div className="hidden md:block mb-6">
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
                        <h2 className="text-white text-xl font-medium mb-4">Today's Weather</h2>
                        <div className="grid grid-cols-7 gap-4">
                            {weatherData.hourly.map((hour, idx) => (
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
                        {weatherData.daily.map((day, idx) => (
                            <div key={idx} className="flex items-center justify-between py-3 border-b border-white/10 last:border-b-0">
                                <div className="flex items-center space-x-3">
                                    <WeatherIcon condition={day.icon} size="w-8 h-8" />
                                    <div>
                                        <p className="text-white font-medium">{day.day}</p>
                                        <p className="text-blue-100 text-sm">{day.date}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-white font-medium">{day.low}-{day.high}°</p>
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

                            {weatherData.daily.map((day, idx) => (
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

                {/* Footer */}
                <footer className="text-center mt-8 text-blue-100 text-sm">
                    {/* Currently only updates time */}
                    <p>Updates every 15 minutes • Last updated: {currentTime}</p>
                </footer>
            </div>
        </div>
    );
};

export default WeatherApp;
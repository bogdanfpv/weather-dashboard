import React from 'react';
import {
    Sun,
    Cloud,
    CloudRain,
    CloudSnow,
    CloudLightning,
    CloudDrizzle,
    Cloudy,
    CloudFog
} from 'lucide-react';

const WeatherIcon = ({
                         condition,
                         size = "w-6 h-6",
                         animated = false,
                         className = ""
                     }) => {
    const baseClasses = animated ? "transition-all duration-300 hover:scale-110" : "";

    const iconMap = {
        // Clear conditions
        clear: <Sun className={`${size} text-yellow-500 ${baseClasses} ${className}`} />,
        sunny: <Sun className={`${size} text-yellow-500 ${baseClasses} ${className}`} />,

        // Cloudy conditions
        cloudy: <Cloud className={`${size} text-gray-500 ${baseClasses} ${className}`} />,
        'partly-cloudy': <Cloudy className={`${size} text-gray-400 ${baseClasses} ${className}`} />,
        overcast: <Cloud className={`${size} text-gray-600 ${baseClasses} ${className}`} />,

        // Rain conditions
        rain: <CloudRain className={`${size} text-blue-500 ${baseClasses} ${className}`} />,
        'light-rain': <CloudDrizzle className={`${size} text-blue-400 ${baseClasses} ${className}`} />,
        'heavy-rain': <CloudRain className={`${size} text-blue-600 ${baseClasses} ${className}`} />,
        drizzle: <CloudDrizzle className={`${size} text-blue-300 ${baseClasses} ${className}`} />,

        // Snow conditions
        snow: <CloudSnow className={`${size} text-blue-200 ${baseClasses} ${className}`} />,
        'light-snow': <CloudSnow className={`${size} text-blue-100 ${baseClasses} ${className}`} />,
        'heavy-snow': <CloudSnow className={`${size} text-white ${baseClasses} ${className}`} />,

        // Severe weather
        thunderstorm: <CloudLightning className={`${size} text-purple-500 ${baseClasses} ${className}`} />,
        storm: <CloudLightning className={`${size} text-purple-600 ${baseClasses} ${className}`} />,

        // Other conditions
        fog: <CloudFog className={`${size} text-gray-400 ${baseClasses} ${className}`} />,
        mist: <CloudFog className={`${size} text-gray-300 ${baseClasses} ${className}`} />
    };

    return iconMap[condition] || iconMap.clear;
};

// Optional: Weather condition mapper for OpenWeather API codes
export const mapOpenWeatherCondition = (weatherCode, isDay = true) => {
    const conditionMap = {
        200: 'thunderstorm', // thunderstorm with light rain
        201: 'thunderstorm', // thunderstorm with rain
        202: 'storm', // thunderstorm with heavy rain
        210: 'thunderstorm', // light thunderstorm
        211: 'thunderstorm', // thunderstorm
        212: 'storm', // heavy thunderstorm
        221: 'thunderstorm', // ragged thunderstorm
        230: 'thunderstorm', // thunderstorm with light drizzle
        231: 'thunderstorm', // thunderstorm with drizzle
        232: 'thunderstorm', // thunderstorm with heavy drizzle

        300: 'drizzle', // light intensity drizzle
        301: 'drizzle', // drizzle
        302: 'drizzle', // heavy intensity drizzle
        310: 'light-rain', // light intensity drizzle rain
        311: 'rain', // drizzle rain
        312: 'rain', // heavy intensity drizzle rain
        313: 'rain', // shower rain and drizzle
        314: 'rain', // heavy shower rain and drizzle
        321: 'rain', // shower drizzle

        500: 'light-rain', // light rain
        501: 'rain', // moderate rain
        502: 'heavy-rain', // heavy intensity rain
        503: 'heavy-rain', // very heavy rain
        504: 'heavy-rain', // extreme rain
        511: 'snow', // freezing rain
        520: 'rain', // light intensity shower rain
        521: 'rain', // shower rain
        522: 'heavy-rain', // heavy intensity shower rain
        531: 'heavy-rain', // ragged shower rain

        600: 'light-snow', // light snow
        601: 'snow', // snow
        602: 'heavy-snow', // heavy snow
        611: 'snow', // sleet
        612: 'snow', // light shower sleet
        613: 'snow', // shower sleet
        615: 'snow', // light rain and snow
        616: 'snow', // rain and snow
        620: 'light-snow', // light shower snow
        621: 'snow', // shower snow
        622: 'heavy-snow', // heavy shower snow

        701: 'mist', // mist
        711: 'fog', // smoke
        721: 'fog', // haze
        731: 'fog', // sand/dust whirls
        741: 'fog', // fog
        751: 'fog', // sand
        761: 'fog', // dust
        762: 'fog', // volcanic ash
        771: 'fog', // squalls
        781: 'storm', // tornado

        800: isDay ? 'clear' : 'clear', // clear sky
        801: 'partly-cloudy', // few clouds: 11-25%
        802: 'cloudy', // scattered clouds: 25-50%
        803: 'cloudy', // broken clouds: 51-84%
        804: 'overcast' // overcast clouds: 85-100%
    };

    return conditionMap[weatherCode] || 'clear';
};

export default WeatherIcon;
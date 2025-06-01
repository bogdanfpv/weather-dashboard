// Create src/utils/weatherAPI.js
const API_KEY = process.env.REACT_APP_OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/3.0/onecall';

export const fetchWeatherData = async (lat = 48.8566, lon = 2.3522) => {
    try {
        const response = await fetch(
            `${BASE_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&exclude=minutely`
        );
        const data = await response.json();
        return transformWeatherData(data);
    } catch (error) {
        console.error('Error fetching weather data:', error);
        throw error;
    }
};

const transformWeatherData = (apiData) => {
    // Transform OpenWeather API data to your component format
    return {
        location: "Paris, FR",
        current: {
            temp: Math.round(apiData.current.temp),
            condition: apiData.current.weather[0].description,
            // ... other transformations
        },
        // ... rest of data transformation
    };
};
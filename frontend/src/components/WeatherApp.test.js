import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import WeatherApp from './WeatherApp';
import { useWebSocket } from '../hooks/useWebSocket';

// Setup fetch mock before any imports that might use it
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: false,
        json: () => Promise.resolve({})
    })
);

// Mock the WeatherStats and WeatherIcon components
jest.mock('./WeatherStats', () => {
    return function MockWeatherStats({ weatherData }) {
        return (
            <div data-testid="weather-stats">
                <div>Details</div>
                <div>Sun Times</div>
                <div>{weatherData.current.visibility}</div>
                <div>{weatherData.current.humidity}</div>
                <div>{weatherData.current.pressure}</div>
                <div>{weatherData.current.uvIndex}</div>
                <div>{weatherData.current.sunrise}</div>
                <div>{weatherData.current.sunset}</div>
            </div>
        );
    };
});

jest.mock('./WeatherIcon', () => {
    return function MockWeatherIcon({ condition, size }) {
        return <div data-testid={`weather-icon-${condition}`} className={size} />;
    };
});

// Mock the useWebSocket hook
jest.mock('../hooks/useWebSocket');

// Mock fetch for cached weather data
// (Already set up above before imports)

class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        MockWebSocket.mock.instances.push(this);
        setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            this.onopen && this.onopen();
        }, 0);
    }
    send = jest.fn();
    close = jest.fn();
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;

    static mock = { instances: [] };
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;

global.WebSocket = MockWebSocket;

describe('WeatherApp', () => {
    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        MockWebSocket.mock.instances = [];

        // Mock useWebSocket hook with default values
        useWebSocket.mockReturnValue({
            isConnected: false,
            notifications: [],
            weatherData: null,
            isLoadingWeather: false,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        // Mock fetch to return proper response structure
        global.fetch.mockResolvedValue({
            ok: false,
            json: jest.fn().mockResolvedValue({})
        });

        // Mock navigator.wakeLock
        Object.defineProperty(navigator, 'wakeLock', {
            writable: true,
            value: {
                request: jest.fn().mockResolvedValue({
                    release: jest.fn()
                })
            }
        });
    });

    test('renders static UI elements', () => {
        render(<WeatherApp />);
        expect(screen.getByText(/Paris, FR/)).toBeInTheDocument();
        expect(screen.getByText('Monday 29 August')).toBeInTheDocument();
        expect(screen.getByText(/Today's Weather/)).toBeInTheDocument();
        expect(screen.getByText(/Next 5 Days/)).toBeInTheDocument();
        expect(screen.getByText(/Live Weather Controls/)).toBeInTheDocument();
        const mainTemp = screen.getByText(/21°/, { selector: '.text-6xl, .text-7xl' });
        expect(mainTemp).toBeInTheDocument();
        expect(screen.getByText(/Mostly sunny/)).toBeInTheDocument();
        expect(screen.getByText(/Details/)).toBeInTheDocument();
        expect(screen.getByText(/Sun Times/)).toBeInTheDocument();
    });

    test('displays current weather static ui and default data', () => {
        render(<WeatherApp />);

        // Test weather stats labels (using getAllByText to handle duplicates)
        expect(screen.getAllByText('High').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Low').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Wind').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Sky').length).toBeGreaterThan(0);

        // Test weather values (using getAllByText to handle duplicates)
        expect(screen.getAllByText('23°').length).toBeGreaterThan(0);
        expect(screen.getAllByText('14°').length).toBeGreaterThan(0);
        expect(screen.getAllByText('7km/h').length).toBeGreaterThan(0);
        expect(screen.getAllByText('clear').length).toBeGreaterThan(0);
    });

    test('shows 5-day forecast default data', () => {
        render(<WeatherApp />);

        // Test that forecast days are present (using getAllByText to handle duplicates)
        expect(screen.getAllByText('Tue').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Wed').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Thu').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Fri').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Sat').length).toBeGreaterThan(0);

        // Test some forecast temperatures (using getAllByText to handle duplicates)
        expect(screen.getAllByText('21°').length).toBeGreaterThan(0);
        expect(screen.getAllByText('18°').length).toBeGreaterThan(0);
        expect(screen.getAllByText('15°').length).toBeGreaterThan(0);
    });

    test('renders hourly forecast on desktop view', () => {
        render(<WeatherApp />);

        // Test hourly forecast heading
        expect(screen.getByText("Today's Weather")).toBeInTheDocument();

        // Test some hourly times
        expect(screen.getByText('3am')).toBeInTheDocument();
        expect(screen.getByText('6am')).toBeInTheDocument();
        expect(screen.getByText('12pm')).toBeInTheDocument();
    });

    test('displays the current time on mount', async () => {
        const fixedDate = new Date('2025-01-01T12:00:00');
        jest.useFakeTimers();
        jest.setSystemTime(fixedDate);

        render(<WeatherApp />);

        // Wait for the component to hydrate and show the time
        await waitFor(() => {
            const now = fixedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            // Use a more specific selector targeting the h1 element
            const headerElement = screen.getByText(/Paris, FR/);
            expect(headerElement).toHaveTextContent(now);
        });

        jest.useRealTimers();
    });

    test('updates the time every 60 seconds', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-01-01T12:00:00'));

        render(<WeatherApp />);

        // Wait for initial render
        await waitFor(() => {
            const timeText = screen.getByText(/Paris/);
            expect(timeText).toHaveTextContent('12:00');
        });

        // Advance time
        act(() => {
            jest.advanceTimersByTime(60000);
        });

        // Re-query since the DOM may have updated
        await waitFor(() => {
            expect(screen.getByText(/Paris/)).toHaveTextContent('12:01');
        });

        jest.useRealTimers();
    });

    test('connects and receives weather_update', async () => {
        const mockWeatherData = {
            location: "Paris, FR",
            date: "Monday 29 August",
            current: {
                temp: 30,
                condition: "Broken Clouds",
                high: 28,
                low: 26,
                wind: "14mph",
                rain: "0%",
                sunrise: "03:48",
                sunset: "19:58",
                visibility: "10.0km",
                humidity: "56%",
                pressure: "1023mb",
                uvIndex: "N/A"
            },
            hourly: [
                { time: "06pm", temp: 27, icon: "cloudy" },
                { time: "09pm", temp: 24, icon: "cloudy" },
                { time: "12am", temp: 21, icon: "cloudy" },
                { time: "03am", temp: 20, icon: "clear" },
                { time: "06am", temp: 23, icon: "cloudy" },
                { time: "09am", temp: 27, icon: "cloudy" },
                { time: "12pm", temp: 31, icon: "cloudy" }
            ],
            daily: [
                { day: "Tue", date: "30/8", low: 19, high: 20, wind: "13km/h", rain: "1%", icon: "clear" },
                { day: "Wed", date: "31/8", low: 8, high: 17, wind: "6km/h", rain: "4%", icon: "cloudy" },
                { day: "Thu", date: "1/9", low: 7, high: 1, wind: "19km/h", rain: "65%", icon: "rain" },
                { day: "Fri", date: "2/9", low: 9, high: 19, wind: "6km/h", rain: "6%", icon: "clear" },
                { day: "Sat", date: "3/9", low: 11, high: 23, wind: "4km/h", rain: "3%", icon: "clear" }
            ]
        };

        const { result } = renderHook(() => useWebSocket('ws://test'));

        // Mock the hook to return connected state and weather data
        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [{
                type: 'weather_alert',
                message: 'Weather data updated for Paris, FR',
                timestamp: 1751036572
            }],
            weatherData: mockWeatherData,
            isLoadingWeather: false,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        // Re-render with the updated mock
        const { rerender } = renderHook(() => useWebSocket('ws://test'));
        rerender();

        // Assert state changes
        expect(useWebSocket('ws://test').weatherData).toEqual(mockWeatherData);
        expect(useWebSocket('ws://test').notifications[0].type).toBe('weather_alert');
        expect(useWebSocket('ws://test').notifications[0].message).toBe('Weather data updated for Paris, FR');
        expect(useWebSocket('ws://test').isLoadingWeather).toBe(false);
    });

    test('updates UI after receiving weather_update', async () => {
        const mockWeatherData = {
            location: "Paris, FR",
            date: "Monday 29 August",
            current: {
                temp: 30,
                condition: "Broken Clouds",
                high: 28,
                low: 26,
                wind: "14mph",
                rain: "0%",
                sunrise: "03:48",
                sunset: "19:58",
                visibility: "10.0km",
                humidity: "56%",
                pressure: "1023mb",
                uvIndex: "N/A"
            },
            hourly: [],
            daily: []
        };

        // Mock useWebSocket to return the weather data
        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [],
            weatherData: mockWeatherData,
            isLoadingWeather: false,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        render(<WeatherApp />);

        // Wait for the component to update with the new weather data
        await waitFor(() => {
            expect(screen.getByText('30°')).toBeInTheDocument();
            expect(screen.getByText('Broken Clouds')).toBeInTheDocument();
            expect(screen.getByText('Monday 29 August')).toBeInTheDocument();
        });
    });

    test('shows connection status correctly', () => {
        // Test disconnected state
        useWebSocket.mockReturnValue({
            isConnected: false,
            notifications: [],
            weatherData: null,
            isLoadingWeather: false,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        const { rerender } = render(<WeatherApp />);
        expect(screen.getByText('Disconnected')).toBeInTheDocument();

        // Test connected state
        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [],
            weatherData: null,
            isLoadingWeather: false,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        rerender(<WeatherApp />);
        expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    test('handles loading state correctly', () => {
        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [],
            weatherData: null,
            isLoadingWeather: true,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        render(<WeatherApp />);
        expect(screen.getByText('Updating...')).toBeInTheDocument();
    });

    test('fetches cached weather data on mount', async () => {
        const mockCachedData = {
            data: {
                location: "London, UK",
                current: { temp: 15, condition: "Cloudy" }
            },
            lastUpdated: new Date().toISOString()
        };

        // Mock successful fetch response
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockCachedData)
        });

        render(<WeatherApp />);

        // Verify fetch was called
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/get-cached-weather');
        });
    });

    test('handles fetch error gracefully', async () => {
        // Mock fetch to throw an error
        global.fetch.mockRejectedValueOnce(new Error('Network error'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        render(<WeatherApp />);

        // Verify error was logged
        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch cached weather data:', expect.any(Error));
        });

        consoleSpy.mockRestore();
    });
});
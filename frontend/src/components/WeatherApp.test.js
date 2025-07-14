import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import WeatherApp from './WeatherApp';
import { useWebSocket } from '../hooks/useWebSocket';

// Setup fetch mock before any imports that might use it
global.fetch = jest.fn();

// Mock the useWebSocket hook
jest.mock('../hooks/useWebSocket');

// Mock WebSocket
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

// Mock weather data
const mockWeatherData = {
    location: "Paris, FR",
    date: "Monday 29 August",
    current: {
        temp: 21,
        condition: "Mostly sunny",
        high: 23,
        low: 14,
        wind: "7km/h",
        sky: "clear",
        sunrise: "06:48",
        sunset: "19:58",
        visibility: "10.0km",
        humidity: "56%",
        pressure: "1023mb",
        uvIndex: "7"
    },
    hourly: [
        { time: "3am", temp: 16, icon: "clear" },
        { time: "6am", temp: 18, icon: "clear" },
        { time: "9am", temp: 20, icon: "clear" },
        { time: "12pm", temp: 22, icon: "clear" },
        { time: "3pm", temp: 23, icon: "clear" },
        { time: "6pm", temp: 21, icon: "clear" },
        { time: "9pm", temp: 19, icon: "clear" }
    ],
    daily: [
        { day: "Tue", date: "30/8", low: 15, high: 21, wind: "8km/h", rain: "10%", icon: "clear" },
        { day: "Wed", date: "31/8", low: 16, high: 18, wind: "6km/h", rain: "20%", icon: "cloudy" },
        { day: "Thu", date: "1/9", low: 14, high: 15, wind: "19km/h", rain: "65%", icon: "rain" },
        { day: "Fri", date: "2/9", low: 13, high: 19, wind: "6km/h", rain: "5%", icon: "clear" },
        { day: "Sat", date: "3/9", low: 15, high: 22, wind: "4km/h", rain: "0%", icon: "clear" }
    ]
};

// Helper function to setup successful fetch mock
const setupSuccessfulFetch = () => {
    global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
            data: mockWeatherData,
            lastUpdated: new Date().toISOString()
        })
    });
};

// Helper function to setup default useWebSocket mock
const setupDefaultWebSocketMock = () => {
    useWebSocket.mockReturnValue({
        isConnected: false,
        notifications: [],
        weatherData: null,
        isLoadingWeather: false,
        canUpdateWeather: true,
        nextUpdateTime: null,
        clearNotifications: jest.fn(),
        requestWeatherUpdate: jest.fn()
    });
};

// Helper function to wait for component to load
const waitForComponentToLoad = async () => {
    await waitFor(() => {
        expect(screen.queryByText('Loading weather data...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
        expect(screen.getByTestId('location-display')).toBeInTheDocument();
    }, { timeout: 3000 });
};

describe('WeatherApp', () => {
    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        MockWebSocket.mock.instances = [];

        // Setup default mocks
        setupDefaultWebSocketMock();
        setupSuccessfulFetch();

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

    test('renders loading state initially', async () => {
        // Mock fetch to return empty response to simulate loading
        global.fetch.mockResolvedValueOnce({
            ok: false,
            json: jest.fn().mockResolvedValue({})
        });

        render(<WeatherApp />);
        expect(screen.getByText('Loading weather data...')).toBeInTheDocument();
    });

    test('renders weather data after loading', async () => {
        render(<WeatherApp />);

        await waitForComponentToLoad();

        expect(screen.getByTestId('date-display')).toHaveTextContent('Monday 29 August');
        expect(screen.getByText("Today's Weather")).toBeInTheDocument();
        expect(screen.getByText(/Next 5 Days/)).toBeInTheDocument();
        expect(screen.getByText(/Live Weather Controls/)).toBeInTheDocument();

        // Check main temperature
        expect(screen.getByTestId('main-temperature')).toHaveTextContent('21°');
        expect(screen.getByTestId('weather-condition')).toHaveTextContent('Mostly sunny');

        // Test WeatherStats component content
        expect(screen.getByText('Weather Stats')).toBeInTheDocument();
        expect(screen.getByText('Sunrise:')).toBeInTheDocument();
        expect(screen.getByText('Sunset:')).toBeInTheDocument();
        expect(screen.getByText('Humidity:')).toBeInTheDocument();
        expect(screen.getByText('Pressure:')).toBeInTheDocument();
        expect(screen.getByText('Visibility:')).toBeInTheDocument();
        expect(screen.getByText('UV Index:')).toBeInTheDocument();
    });

    test('displays current weather data correctly', async () => {
        render(<WeatherApp />);

        await waitForComponentToLoad();

        // Use more specific selectors to find the elements
        const quickStatsRow = screen.getByTestId('high-temp').parentElement.parentElement;

        // Test weather stats labels within the quick stats row
        expect(within(quickStatsRow).getByText('High')).toBeInTheDocument();
        expect(within(quickStatsRow).getByText('Low')).toBeInTheDocument();
        expect(within(quickStatsRow).getByText('Wind')).toBeInTheDocument();
        expect(within(quickStatsRow).getByText('Sky')).toBeInTheDocument();

        // Test weather values using testids
        expect(screen.getByTestId('high-temp')).toHaveTextContent('23°');
        expect(screen.getByTestId('low-temp')).toHaveTextContent('14°');
        expect(screen.getByTestId('wind-speed')).toHaveTextContent('7km/h');
        expect(screen.getByTestId('sky-condition')).toHaveTextContent('clear');
    });

    test('shows 5-day forecast data', async () => {
        render(<WeatherApp />);

        await waitForComponentToLoad();

        // Test that forecast days are present - use getAllByText since they appear in mobile and desktop layouts
        expect(screen.getAllByText('Tue')).toHaveLength(2); // Both mobile and desktop
        expect(screen.getAllByText('Wed')).toHaveLength(2);
        expect(screen.getAllByText('Thu')).toHaveLength(2);
        expect(screen.getAllByText('Fri')).toHaveLength(2);
        expect(screen.getAllByText('Sat')).toHaveLength(2);

        // Use a more specific selector to find the forecast temperatures
        // Look for temperatures specifically in the forecast section
        const forecastSection = screen.getByText(/Next 5 Days/).closest('div');
        expect(forecastSection).toHaveTextContent('21°');
        expect(forecastSection).toHaveTextContent('18°');
        expect(forecastSection).toHaveTextContent('15°');
    });

    test('renders hourly forecast on desktop view', async () => {
        render(<WeatherApp />);

        await waitForComponentToLoad();

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

        await waitForComponentToLoad();

        // Wait for the time to be displayed
        await waitFor(() => {
            const now = fixedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            const locationDisplay = screen.getByTestId('location-display');
            expect(locationDisplay).toHaveTextContent(now);
        });

        jest.useRealTimers();
    });

    test('updates the time every 60 seconds', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-01-01T12:00:00'));

        render(<WeatherApp />);

        await waitForComponentToLoad();

        // Wait for initial time display
        await waitFor(() => {
            const locationDisplay = screen.getByTestId('location-display');
            expect(locationDisplay).toHaveTextContent('12:00');
        });

        // Advance time by 60 seconds
        act(() => {
            jest.advanceTimersByTime(60000);
        });

        // Check that time has updated
        await waitFor(() => {
            const locationDisplay = screen.getByTestId('location-display');
            expect(locationDisplay).toHaveTextContent('12:01');
        });

        jest.useRealTimers();
    });

    test('handles WebSocket connection and weather updates', async () => {
        const updatedWeatherData = {
            ...mockWeatherData,
            current: {
                ...mockWeatherData.current,
                temp: 30,
                condition: "Broken Clouds"
            }
        };

        // First render with initial data
        const { rerender } = render(<WeatherApp />);

        await waitForComponentToLoad();

        // Now mock useWebSocket to return connected state and updated weather data
        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [{
                type: 'weather_alert',
                message: 'Weather data updated for Paris, FR',
                timestamp: 1751036572
            }],
            weatherData: updatedWeatherData,
            isLoadingWeather: false,
            canUpdateWeather: true,
            nextUpdateTime: null,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        // Rerender the component with the updated mock
        rerender(<WeatherApp />);

        // Wait for the component to update with the new weather data
        await waitFor(() => {
            expect(screen.getByTestId('main-temperature')).toHaveTextContent('30°');
            expect(screen.getByTestId('weather-condition')).toHaveTextContent('Broken Clouds');
        });
    });

    test('shows connection status correctly', async () => {
        // Test disconnected state
        useWebSocket.mockReturnValue({
            isConnected: false,
            notifications: [],
            weatherData: null,
            isLoadingWeather: false,
            canUpdateWeather: true,
            nextUpdateTime: null,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        const { rerender } = render(<WeatherApp />);

        await waitForComponentToLoad();

        expect(screen.getByText('Disconnected')).toBeInTheDocument();

        // Test connected state
        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [],
            weatherData: null,
            isLoadingWeather: false,
            canUpdateWeather: true,
            nextUpdateTime: null,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        rerender(<WeatherApp />);

        await waitFor(() => {
            expect(screen.getByText('Connected')).toBeInTheDocument();
        });
    });

    test('handles loading state correctly', async () => {
        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [],
            weatherData: null,
            isLoadingWeather: true,
            canUpdateWeather: false,
            nextUpdateTime: null,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        render(<WeatherApp />);

        await waitForComponentToLoad();

        // Look for the button containing "Updating..." text
        expect(screen.getByText('Updating...')).toBeInTheDocument();
    });

    test('handles rate limiting correctly', async () => {
        const nextUpdateTime = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
        const expectedTimeString = new Date(nextUpdateTime * 1000).toLocaleTimeString();

        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [],
            weatherData: null,
            isLoadingWeather: false,
            canUpdateWeather: false,
            nextUpdateTime: nextUpdateTime,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        render(<WeatherApp />);

        await waitForComponentToLoad();

        // Look for the specific time string in the button text
        expect(screen.getByText(new RegExp(`Available at ${expectedTimeString}`))).toBeInTheDocument();
    });

    test('fetches cached weather data on mount', async () => {
        const mockCachedData = {
            data: {
                location: "London, UK",
                date: "Monday 29 August",
                current: { temp: 15, condition: "Cloudy" },
                hourly: [],
                daily: []
            },
            lastUpdated: new Date().toISOString()
        };

        // Mock successful fetch response
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockCachedData)
        });

        render(<WeatherApp />);

        // Wait for component to load
        await waitFor(() => {
            expect(screen.queryByText('Loading weather data...')).not.toBeInTheDocument();
        });

        // Verify fetch was called with correct parameters
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/get-cached-weather'),
            expect.objectContaining({
                cache: 'no-store',
                headers: expect.objectContaining({
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                })
            })
        );
    });

    test('handles fetch error', async () => {
        // Clear any existing mocks
        jest.clearAllMocks();

        // First, we'll create a spy on console.error
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock first fetch to throw an error
        global.fetch.mockRejectedValueOnce(new Error('Network error'));

        // Important: Looking at the component code, after an error it will still
        // try to render the loading state indefinitely. We need to verify that
        // the error is logged but we can't expect the loading state to disappear.
        render(<WeatherApp />);

        // Wait for the error to be logged
        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch cached weather data:', expect.any(Error));
        });

        // Since we know the component will stay in loading state after the error,
        // we should verify that the loading state is indeed present
        expect(screen.getByText('Loading weather data...')).toBeInTheDocument();

        // Clean up
        consoleSpy.mockRestore();
    }, 5000);

    test('displays notifications correctly', async () => {
        const mockNotifications = [
            {
                type: 'weather_alert',
                message: 'Weather data updated for Paris, FR',
                timestamp: 1751036572
            }
        ];

        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: mockNotifications,
            weatherData: null,
            isLoadingWeather: false,
            canUpdateWeather: true,
            nextUpdateTime: null,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: jest.fn()
        });

        render(<WeatherApp />);

        await waitForComponentToLoad();

        expect(screen.getByText('Weather Alert')).toBeInTheDocument();
        expect(screen.getByText('Weather data updated for Paris, FR')).toBeInTheDocument();
        expect(screen.getByText('Clear (1)')).toBeInTheDocument();
    });

    test('handles sidebar toggle', async () => {
        render(<WeatherApp />);

        await waitForComponentToLoad();

        // Locate the sidebar element by its test ID
        const sidebar = screen.getByTestId('sidebar');

        // Initially, the sidebar should be closed
        expect(sidebar).toHaveClass('-translate-x-full');

        // Click the menu button to open the sidebar
        const menuButton = screen.getByRole('button', { name: /menu/i });
        fireEvent.click(menuButton);

        // Now, the sidebar should be open
        expect(sidebar).toHaveClass('translate-x-0');
    });

    test('handles weather update button click', async () => {
        const mockRequestWeatherUpdate = jest.fn();

        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [],
            weatherData: null,
            isLoadingWeather: false,
            canUpdateWeather: true,
            nextUpdateTime: null,
            clearNotifications: jest.fn(),
            requestWeatherUpdate: mockRequestWeatherUpdate
        });

        render(<WeatherApp />);

        await waitForComponentToLoad();

        // Find and click the update weather button
        const updateButton = screen.getByRole('button', { name: /update weather/i });
        fireEvent.click(updateButton);

        expect(mockRequestWeatherUpdate).toHaveBeenCalled();
    });

    test('handles notification clearing', async () => {
        const mockClearNotifications = jest.fn();

        useWebSocket.mockReturnValue({
            isConnected: true,
            notifications: [
                {
                    type: 'weather_alert',
                    message: 'Test notification',
                    timestamp: 1751036572
                }
            ],
            weatherData: null,
            isLoadingWeather: false,
            canUpdateWeather: true,
            nextUpdateTime: null,
            clearNotifications: mockClearNotifications,
            requestWeatherUpdate: jest.fn()
        });

        render(<WeatherApp />);

        await waitForComponentToLoad();

        // Wait for notifications to appear
        await waitFor(() => {
            expect(screen.getByText('Test notification')).toBeInTheDocument();
        });

        // Find the clear button
        const clearButton = screen.getByText('Clear (1)');
        fireEvent.click(clearButton);

        expect(mockClearNotifications).toHaveBeenCalled();
    });
});
import { renderHook, waitFor } from '@testing-library/react';
import { useWeatherCache } from '@/src/hooks/useWeatherCache';

describe('Integration Test: Cache Loading Flow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('useWeatherCache fetches and processes cached weather data', async () => {
    const mockWeatherData = {
      success: true,
      data: {
        location: 'Paris, FR',
        current: {
          temp: 25,
          feels_like: 23,
          condition: 'Clear',
          icon: '01d',
          humidity: 60,
          wind_speed: 5.2,
          pressure: 1013,
          visibility: 10
        },
        hourly: [
          { time: '12 PM', temp: 25, icon: '01d' },
          { time: '1 PM', temp: 26, icon: '01d' }
        ],
        daily: [
          { day: 'Mon', high: 28, low: 20, icon: '01d' }
        ]
      },
      lastUpdated: '2024-11-08T10:30:00Z',
      location: 'Paris, FR'
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockWeatherData),
      })
    );

    let capturedWeatherData = null;
    let capturedLastUpdated = null;
    const mockSetCachedWeatherData = jest.fn((data) => {
      capturedWeatherData = data;
    });
    const mockSetLastUpdated = jest.fn((time) => {
      capturedLastUpdated = time;
    });

    const { result } = renderHook(() =>
      useWeatherCache('Paris, FR', mockSetCachedWeatherData, mockSetLastUpdated)
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isDataReady).toBe(false);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isDataReady).toBe(true);
    expect(mockSetCachedWeatherData).toHaveBeenCalledWith(mockWeatherData.data);
    expect(capturedWeatherData).toEqual(mockWeatherData.data);
    expect(mockSetLastUpdated).toHaveBeenCalled();
    expect(capturedLastUpdated).toBeTruthy();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/get-cached-weather'),
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }),
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('location=Paris%2C%20FR'),
      expect.any(Object)
    );
  });

  test('useWeatherCache handles empty cache (404 response)', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          message: 'No cached weather data available'
        }),
      })
    );

    const mockSetCachedWeatherData = jest.fn();
    const mockSetLastUpdated = jest.fn();

    const { result } = renderHook(() =>
      useWeatherCache('London, UK', mockSetCachedWeatherData, mockSetLastUpdated)
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isDataReady).toBe(false);
    expect(mockSetCachedWeatherData).not.toHaveBeenCalled();
  });

  test('useWeatherCache handles fetch errors', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const mockSetCachedWeatherData = jest.fn();
    const mockSetLastUpdated = jest.fn();

    const { result } = renderHook(() =>
      useWeatherCache('Berlin, DE', mockSetCachedWeatherData, mockSetLastUpdated)
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isDataReady).toBe(false);
    expect(mockSetCachedWeatherData).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  test('useWeatherCache refetches when location changes', async () => {
    const parisData = {
      success: true,
      data: {
        location: 'Paris, FR',
        current: { temp: 25, condition: 'Clear', icon: '01d' }
      },
      lastUpdated: '2024-11-08T10:30:00Z'
    };

    const londonData = {
      success: true,
      data: {
        location: 'London, UK',
        current: { temp: 18, condition: 'Cloudy', icon: '03d' }
      },
      lastUpdated: '2024-11-08T10:35:00Z'
    };

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(parisData)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(londonData)
      });

    let capturedWeatherData = null;
    const mockSetCachedWeatherData = jest.fn((data) => {
      capturedWeatherData = data;
    });
    const mockSetLastUpdated = jest.fn();

    const { result, rerender } = renderHook(
      ({ location }) => useWeatherCache(location, mockSetCachedWeatherData, mockSetLastUpdated),
      { initialProps: { location: 'Paris, FR' } }
    );

    await waitFor(() => {
      expect(result.current.isDataReady).toBe(true);
    });

    expect(capturedWeatherData.location).toBe('Paris, FR');
    expect(capturedWeatherData.current.temp).toBe(25);
    rerender({ location: 'London, UK' });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isDataReady).toBe(false);

    await waitFor(() => {
      expect(result.current.isDataReady).toBe(true);
    });

    expect(capturedWeatherData.location).toBe('London, UK');
    expect(capturedWeatherData.current.temp).toBe(18);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('location=Paris%2C%20FR'),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('location=London%2C%20UK'),
      expect.any(Object)
    );
  });
});
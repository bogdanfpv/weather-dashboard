import { renderHook, waitFor, act } from '@testing-library/react';
import { useWeatherCache } from '@/src/hooks/useWeatherCache';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import WS from 'jest-websocket-mock';

describe('Integration Test: Location Change Flow', () => {
  let server;
  const url = 'ws://localhost:1234';

  beforeEach(async () => {
    server = new WS(url);
  });

  afterEach(() => {
    WS.clean();
    jest.restoreAllMocks();
  });s

  test('cache and websocket both update when location changes', async () => {
    const parisData = {
      success: true,
      data: {
        location: 'Paris, FR',
        current: { temp: 20, condition: 'Cloudy' }
      },
      lastUpdated: new Date().toISOString()
    };

    const londonData = {
      success: true,
      data: {
        location: 'London, UK',
        current: { temp: 15, condition: 'Rainy' }
      },
      lastUpdated: new Date().toISOString()
    };

    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(parisData) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(londonData) });

    let capturedWeatherData = null;
    const mockSetCachedWeatherData = jest.fn((data) => {
      capturedWeatherData = data;
    });
    const mockSetLastUpdated = jest.fn();

    const { result: cacheResult, rerender: cacheRerender } = renderHook(
      ({ location }) => useWeatherCache(location, mockSetCachedWeatherData, mockSetLastUpdated),
      { initialProps: { location: 'Paris, FR' } }
    );

    const { result: wsResult, rerender: wsRerender } = renderHook(
      ({ city, country }) => useWebSocket(url, { city, country }),
      { initialProps: { city: 'Paris', country: 'FR' } }
    );

    await waitFor(() => {
      expect(cacheResult.current.isDataReady).toBe(true);
    });

    expect(capturedWeatherData.location).toBe('Paris, FR');

    await server.connected;

    await waitFor(() => {
      expect(wsResult.current.isConnected).toBe(true);
    });
    await expect(server).toReceiveMessage(
      JSON.stringify({
        action: 'get_rate_limit_status',
        city: 'Paris',
        country: 'FR'
      })
    );

    cacheRerender({ location: 'London, UK' });
    wsRerender({ city: 'London', country: 'UK' });
    await waitFor(() => {
      expect(cacheResult.current.isLoading).toBe(true);
    });

    await waitFor(() => {
      expect(wsResult.current.canUpdateWeather).toBe(false);
    });

    await waitFor(() => {
      expect(capturedWeatherData?.location).toBe('London, UK');
    });

    await expect(server).toReceiveMessage(
      JSON.stringify({
        action: 'get_rate_limit_status',
        city: 'London',
        country: 'UK'
      })
    );
  });
});
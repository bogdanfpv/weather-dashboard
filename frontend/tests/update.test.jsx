import { renderHook, waitFor, act } from '@testing-library/react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import WS from 'jest-websocket-mock';

describe('Integration Test: Live Weather Update Flow', () => {
  let server;
  const url = 'ws://localhost:1234';

  beforeEach(async () => {
    server = new WS(url);
  });

  afterEach(() => {
    WS.clean();
  });

  test('requestWeatherUpdate sends WebSocket message and receives weather data', async () => {
    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );

    await server.connected;

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    await expect(server).toReceiveMessage(
      JSON.stringify({
        action: 'get_rate_limit_status',
        city: 'Paris',
        country: 'FR'
      })
    );
    act(() => {
      server.send(JSON.stringify({
        type: 'rate_limit_status',
        location: 'paris_fr',
        can_update: true,
        nextUpdateTime: null
      }));
    });

    await waitFor(() => {
      expect(result.current.canUpdateWeather).toBe(true);
    });

    act(() => {
      result.current.requestWeatherUpdate('Paris', 'FR');
    });

    const weatherRequest = await server.nextMessage;
    const parsedRequest = JSON.parse(weatherRequest);

    expect(parsedRequest.action).toBe('get_weather');
    expect(parsedRequest.city).toBe('Paris');
    expect(parsedRequest.country).toBe('FR');
    expect(parsedRequest.timestamp).toBeDefined();
    const weatherData = {
      location: 'Paris, FR',
      current: { temp: 22, condition: 'Sunny', icon: '01d' },
      hourly: [],
      daily: []
    };

    act(() => {
      server.send(JSON.stringify({
        type: 'weather_update',
        data: weatherData,
        location: 'Paris, FR',
        nextUpdateTime: new Date(Date.now() + 300000).toISOString()
      }));
    });

    await waitFor(() => {
      expect(result.current.weatherData).toEqual(weatherData);
    });

    expect(result.current.isLoadingWeather).toBe(false);
    expect(result.current.canUpdateWeather).toBe(false);
  });

  test('requestWeatherUpdate fails when not connected', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:9999', { city: 'Paris', country: 'FR' })
    );
    await new Promise(resolve => setTimeout(resolve, 100));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    act(() => {
      const success = result.current.requestWeatherUpdate('Paris', 'FR');
      expect(success).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.notifications.length).toBeGreaterThan(0);
    });

    expect(result.current.notifications[0].type).toBe('error');
    expect(result.current.notifications[0].message).toContain('Not connected');
  });
});
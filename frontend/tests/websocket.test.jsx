import { renderHook, waitFor, act } from '@testing-library/react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import WS from 'jest-websocket-mock';

describe('Integration Test: WebSocket Connection Flow', () => {
  let server;
  const url = 'ws://localhost:1234';

  beforeEach(async () => {
    server = new WS(url);
  });

  afterEach(() => {
    WS.clean();
  });

  test('useWebSocket establishes connection and updates connection state', async () => {
    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );

    expect(result.current.isConnected).toBe(false);

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
  });

  test('useWebSocket handles disconnection and attempts reconnection', async () => {
    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );

    await server.connected;

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
    await expect(server).toReceiveMessage(expect.any(String));

    server.close();

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });
  });

  test('useWebSocket handles rate limit status message', async () => {
    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );

    await server.connected;

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    await expect(server).toReceiveMessage(expect.any(String));

    server.send(JSON.stringify({
      type: 'rate_limit_status',
      location: 'paris_fr',
      can_update: true,
      nextUpdateTime: null
    }));

    await waitFor(() => {
      expect(result.current.canUpdateWeather).toBe(true);
    });

    expect(result.current.nextUpdateTime).toBe(null);
  });

  test('useWebSocket handles token available message', async () => {
    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );

    await server.connected;

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
    await expect(server).toReceiveMessage(expect.any(String));

    expect(result.current.canUpdateWeather).toBe(false);

    server.send(JSON.stringify({
      type: 'token_available',
      city: 'Paris',
      country: 'FR',
      location: 'Paris, FR'
    }));

    await waitFor(() => {
      expect(result.current.canUpdateWeather).toBe(true);
    });

    expect(result.current.nextUpdateTime).toBe(null);

    await waitFor(() => {
      expect(result.current.notifications.length).toBe(1);
    });

    expect(result.current.notifications[0].type).toBe('success');
    expect(result.current.notifications[0].message).toContain('Weather updates are now available');
  });

  test('useWebSocket handles token unavailable message', async () => {
    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );

    await server.connected;

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
    await expect(server).toReceiveMessage(expect.any(String));

    const nextUpdate = new Date(Date.now() + 300000).toISOString();

    server.send(JSON.stringify({
      type: 'token_unavailable',
      city: 'Paris',
      country: 'FR',
      location: 'Paris, FR',
      nextUpdateTime: nextUpdate
    }));

    await waitFor(() => {
      expect(result.current.canUpdateWeather).toBe(false);
    });

    expect(result.current.nextUpdateTime).toBe(nextUpdate);
  });

  test('useWebSocket requests rate limit status when location changes', async () => {
    const { result, rerender } = renderHook(
      ({ city, country }) => useWebSocket(url, { city, country }),
      { initialProps: { city: 'Paris', country: 'FR' } }
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
    rerender({ city: 'London', country: 'UK' });

    await waitFor(() => {
      expect(result.current.canUpdateWeather).toBe(false);
    });

    await expect(server).toReceiveMessage(
      JSON.stringify({
        action: 'get_rate_limit_status',
        city: 'London',
        country: 'UK'
      })
    );
  });

  test('useWebSocket handles WebSocket errors', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );
    await server.connected;

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
    await expect(server).toReceiveMessage(expect.any(String));

    server.error();

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    expect(result.current.isLoadingWeather).toBe(false);
    expect(result.current.canUpdateWeather).toBe(false);

    consoleError.mockRestore();
  });
});
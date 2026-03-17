import { renderHook, waitFor, act } from '@testing-library/react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import WS from 'jest-websocket-mock';

describe('Integration Test: Notification System Flow', () => {
  let server;
  const url = 'ws://localhost:1234';

  beforeEach(async () => {
    server = new WS(url);
  });

  afterEach(() => {
    WS.clean();
    jest.restoreAllMocks();
  });

  test('creates notifications from WebSocket events', async () => {
    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );

    await server.connected;

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
    await expect(server).toReceiveMessage(expect.any(String));

    expect(result.current.notifications.length).toBe(0);

    act(() => {
      server.send(JSON.stringify({
        type: 'token_available',
        city: 'Paris',
        country: 'FR',
        location: 'Paris, FR'
      }));
    });

    await waitFor(() => {
      expect(result.current.notifications.length).toBe(1);
      expect(result.current.notifications[0].type).toBe('success');
    });

    act(() => {
      server.send(JSON.stringify({
        type: 'error',
        message: 'Something went wrong'
      }));
    });

    await waitFor(() => {
      expect(result.current.notifications.length).toBe(2);
      expect(result.current.notifications[0].type).toBe('error');
    });
  });

  test('clearNotifications removes all notifications', async () => {
    const { result } = renderHook(() =>
      useWebSocket(url, { city: 'Paris', country: 'FR' })
    );

    await server.connected;

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
    await expect(server).toReceiveMessage(expect.any(String));

    act(() => {
      server.send(JSON.stringify({
        type: 'token_available',
        city: 'Paris',
        country: 'FR'
      }));
    });

    await waitFor(() => {
      expect(result.current.notifications.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.clearNotifications();
    });

    expect(result.current.notifications.length).toBe(0);
  });
});
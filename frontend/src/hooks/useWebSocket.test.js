import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "./useWebSocket";

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.sentMessages = [];

    // Store reference for testing
    MockWebSocket.instances.push(this);
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: 1000, reason: "Normal closure" });
    }
  }

  // Helper method to simulate receiving messages
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  // Helper method to simulate connection opening
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }

  // Helper method to simulate error
  simulateError(error) {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  // Helper to get last sent message
  getLastSentMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }
}

// Static properties and methods for MockWebSocket
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;
MockWebSocket.instances = [];

// Setup global WebSocket mock
global.WebSocket = MockWebSocket;

describe("useWebSocket Rate Limiting", () => {
  let mockWebSocket;
  let originalConsoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    MockWebSocket.instances = [];

    // Mock console.error to suppress expected error messages during tests
    originalConsoleError = console.error;
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    MockWebSocket.instances = [];

    // Restore original console.error
    console.error = originalConsoleError;
  });

  const connectAndGetWebSocket = async () => {
    const { result } = renderHook(() => useWebSocket("ws://localhost:8080"));

    // Wait for the WebSocket to be created
    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    mockWebSocket = MockWebSocket.instances[0];

    // Simulate connection opening
    act(() => {
      mockWebSocket.simulateOpen();
    });

    return { result, mockWebSocket };
  };

  describe("Initial Rate Limit Status", () => {
    it("should request rate limit status on connection", async () => {
      const { mockWebSocket } = await connectAndGetWebSocket();

      const lastMessage = mockWebSocket.getLastSentMessage();
      expect(lastMessage).toEqual(
        JSON.stringify({
          action: "get_rate_limit_status",
          city: "Paris",
          country: "FR",
        }),
      );
    });

    it("should initialize with canUpdateWeather as false", async () => {
      const { result } = await connectAndGetWebSocket();

      expect(result.current.canUpdateWeather).toBe(false);
      expect(result.current.nextUpdateTime).toBeNull();
    });
  });

  describe("Rate Limit Status Messages", () => {
    it("should handle rate_limit_status message when updates are allowed", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Simulate rate limit status message - updates allowed
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: true,
          nextUpdateTime: null,
          timestamp: 1000,
        });
      });

      expect(result.current.canUpdateWeather).toBe(true);
      expect(result.current.nextUpdateTime).toBeNull();
    });

    it("should handle rate_limit_status message when updates are blocked", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      const nextUpdateTime = Date.now() / 1000 + 2700; // 45 minutes from now

      // Simulate rate limit status message - updates blocked
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: false,
          nextUpdateTime: nextUpdateTime,
          timestamp: 1000,
        });
      });

      expect(result.current.canUpdateWeather).toBe(false);
      expect(result.current.nextUpdateTime).toBe(nextUpdateTime);
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("rate_limit");
      expect(result.current.notifications[0].message).toContain(
        "Weather updates available again at",
      );
    });

    it("should handle rate_limit_updated message", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Simulate rate limit becoming available
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_updated",
          canUpdate: true,
          nextUpdateTime: null,
          timestamp: 1000,
        });
      });

      expect(result.current.canUpdateWeather).toBe(true);
      expect(result.current.nextUpdateTime).toBeNull();
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("rate_limit_available");
      expect(result.current.notifications[0].message).toBe(
        "Weather updates are now available!",
      );
    });

    it("should handle rate_limit_updated message when still blocked", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      const nextUpdateTime = Date.now() / 1000 + 1800; // 30 minutes from now

      // Simulate rate limit still active
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_updated",
          canUpdate: false,
          nextUpdateTime: nextUpdateTime,
          timestamp: 1000,
        });
      });

      expect(result.current.canUpdateWeather).toBe(false);
      expect(result.current.nextUpdateTime).toBe(nextUpdateTime);
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("rate_limit");
      expect(result.current.notifications[0].message).toContain(
        "Weather updates limited until",
      );
    });
  });

  describe("Weather Request Denied", () => {
    it("should handle weather_request_denied message", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Simulate weather request denied
      act(() => {
        mockWebSocket.simulateMessage({
          type: "weather_request_denied",
          message:
            "Weather update request denied. Please wait before requesting again.",
          nextUpdateTime: Date.now() / 1000 + 2700,
          timestamp: 1000,
        });
      });

      expect(result.current.isLoadingWeather).toBe(false);
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("error");
      expect(result.current.notifications[0].message).toBe(
        "Weather update request denied. Please wait before requesting again.",
      );
    });
  });

  describe("requestWeatherUpdate Function", () => {
    it("should prevent weather requests when not connected", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost:8080"));

      // Don't connect - call immediately while disconnected
      act(() => {
        const success = result.current.requestWeatherUpdate();
        expect(success).toBe(false);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("error");
      expect(result.current.notifications[0].message).toBe(
        "Cannot update weather: Not connected to server",
      );
    });

    it("should prevent weather requests when rate limited", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Set rate limit state
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: false,
          nextUpdateTime: Date.now() / 1000 + 2700,
          timestamp: 1000,
        });
      });

      act(() => {
        const success = result.current.requestWeatherUpdate();
        expect(success).toBe(false);
      });

      expect(result.current.notifications).toHaveLength(2); // One from rate_limit_status, one from failed request
      // Find the error notification (not the rate_limit one)
      const errorNotification = result.current.notifications.find(
        (n) => n.type === "error",
      );
      expect(errorNotification).toBeDefined();
      expect(errorNotification.message).toContain(
        "Weather updates are rate limited",
      );
    });

    it("should allow weather requests when connected and not rate limited", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Set rate limit state to allow updates
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: true,
          nextUpdateTime: null,
          timestamp: 1000,
        });
      });

      act(() => {
        const success = result.current.requestWeatherUpdate("London", "UK");
        expect(success).toBe(true);
      });

      expect(result.current.isLoadingWeather).toBe(true);

      // Check the last sent message (should be the weather request, not the initial rate limit status)
      const sentMessages = mockWebSocket.sentMessages;
      const weatherRequest = sentMessages.find((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.action === "get_weather";
      });

      expect(weatherRequest).toBeDefined();
      const parsedWeatherRequest = JSON.parse(weatherRequest);
      expect(parsedWeatherRequest.action).toBe("get_weather");
      expect(parsedWeatherRequest.city).toBe("London");
      expect(parsedWeatherRequest.country).toBe("UK");
      expect(typeof parsedWeatherRequest.timestamp).toBe("number");
    });

    it("should show helpful error message with next update time", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      const nextUpdateTime = Date.now() / 1000 + 2700;

      // Set rate limit state
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: false,
          nextUpdateTime: nextUpdateTime,
          timestamp: 1000,
        });
      });

      act(() => {
        const success = result.current.requestWeatherUpdate();
        expect(success).toBe(false);
      });

      const errorNotification = result.current.notifications.find(
        (n) => n.type === "error",
      );
      expect(errorNotification).toBeDefined();
      expect(errorNotification.message).toContain("Try again at");
      expect(errorNotification.message).toContain(
        new Date(nextUpdateTime * 1000).toLocaleTimeString(),
      );
    });
  });

  describe("Connection State Changes", () => {
    it("should reset rate limit state on disconnect", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Set rate limit state
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: true,
          nextUpdateTime: null,
          timestamp: 1000,
        });
      });

      expect(result.current.canUpdateWeather).toBe(true);

      // Simulate disconnect
      act(() => {
        mockWebSocket.close();
      });

      expect(result.current.canUpdateWeather).toBe(false);
      expect(result.current.nextUpdateTime).toBeNull();
      expect(result.current.isLoadingWeather).toBe(false);
    });

    it("should reset rate limit state on error", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Set rate limit state
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: true,
          nextUpdateTime: null,
          timestamp: 1000,
        });
      });

      expect(result.current.canUpdateWeather).toBe(true);

      // Simulate error
      act(() => {
        mockWebSocket.simulateError(new Error("Connection error"));
      });

      expect(result.current.canUpdateWeather).toBe(false);
      expect(result.current.nextUpdateTime).toBeNull();
      expect(result.current.isLoadingWeather).toBe(false);
    });
  });

  describe("Weather Success Flow", () => {
    it("should handle successful weather update and reset loading state", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Set rate limit state to allow updates
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: true,
          nextUpdateTime: null,
          timestamp: 1000,
        });
      });

      // Request weather update
      act(() => {
        result.current.requestWeatherUpdate();
      });
      expect(result.current.isLoadingWeather).toBe(true);

      // Simulate successful weather response
      act(() => {
        mockWebSocket.simulateMessage({
          type: "weather_update",
          data: {
            location: "Paris, FR",
            current: { temp: 20 },
          },
          timestamp: 1000,
        });
      });

      expect(result.current.isLoadingWeather).toBe(false);
      expect(result.current.weatherData).toEqual({
        location: "Paris, FR",
        current: { temp: 20 },
      });
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("weather_alert");
    });

    it("should handle weather error and reset loading state", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Set rate limit state to allow updates
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: true,
          nextUpdateTime: null,
          timestamp: 1000,
        });
      });

      // Request weather update
      act(() => {
        result.current.requestWeatherUpdate();
      });
      expect(result.current.isLoadingWeather).toBe(true);

      // Simulate weather error response
      act(() => {
        mockWebSocket.simulateMessage({
          type: "weather_error",
          message: "API key invalid",
          timestamp: 1000,
        });
      });

      expect(result.current.isLoadingWeather).toBe(false);
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("error");
      expect(result.current.notifications[0].message).toBe("API key invalid");
    });
  });

  describe("Edge Cases", () => {
    it("should handle malformed rate limit messages gracefully", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Simulate malformed rate limit message
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          // Missing required fields - should default to safe values
          timestamp: 1000,
        });
      });

      // Should not crash and should maintain safe defaults
      expect(result.current.canUpdateWeather).toBe(false);
      expect(result.current.nextUpdateTime).toBeNull();
    });

    it("should handle rate limit message with nextUpdateTime but no time display", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Set rate limit state without nextUpdateTime
      act(() => {
        mockWebSocket.simulateMessage({
          type: "rate_limit_status",
          canUpdate: false,
          nextUpdateTime: null,
          timestamp: 1000,
        });
      });

      act(() => {
        const success = result.current.requestWeatherUpdate();
        expect(success).toBe(false);
      });

      const errorNotification = result.current.notifications.find(
        (n) => n.type === "error",
      );
      expect(errorNotification).toBeDefined();
      expect(errorNotification.message).toContain("Try again at later");
    });
  });

  describe("API Gateway Error Handling", () => {
    it("should handle API Gateway Forbidden error", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Simulate API Gateway error
      act(() => {
        mockWebSocket.simulateMessage({
          message: "Forbidden",
        });
      });

      expect(result.current.isLoadingWeather).toBe(false);
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("error");
      expect(result.current.notifications[0].message).toContain(
        "API Error: Forbidden",
      );
    });

    it("should handle API Gateway Internal server error", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Simulate API Gateway error
      act(() => {
        mockWebSocket.simulateMessage({
          message: "Internal server error",
        });
      });

      expect(result.current.isLoadingWeather).toBe(false);
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("error");
      expect(result.current.notifications[0].message).toContain(
        "API Error: Internal server error",
      );
    });
  });

  describe("WebSocket URL Changes", () => {
    it("should disconnect when URL becomes null", async () => {
      let url = "ws://localhost:8080";
      const { result, rerender } = renderHook(({ url }) => useWebSocket(url), {
        initialProps: { url },
      });

      // Wait for connection
      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      const initialWebSocket = MockWebSocket.instances[0];
      act(() => {
        initialWebSocket.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);

      // Change URL to null
      act(() => {
        url = null;
        rerender({ url });
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.canUpdateWeather).toBe(false);
      expect(result.current.nextUpdateTime).toBeNull();
    });
  });

  describe("Notification Management", () => {
    it("should limit notifications to 10 items", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Generate 12 notifications
      for (let i = 0; i < 12; i++) {
        act(() => {
          mockWebSocket.simulateMessage({
            type: "test",
            message: `Test message ${i}`,
            timestamp: 1000 + i,
          });
        });
      }

      // Should only keep the latest 10 notifications
      expect(result.current.notifications).toHaveLength(10);
      // The first notification should be the latest one (message 11)
      expect(result.current.notifications[0].message).toBe("Test message 11");
    });

    it("should clear all notifications", async () => {
      const { result, mockWebSocket } = await connectAndGetWebSocket();

      // Add some notifications
      act(() => {
        mockWebSocket.simulateMessage({
          type: "test",
          message: "Test message",
          timestamp: 1000,
        });
      });

      expect(result.current.notifications).toHaveLength(1);

      // Clear notifications
      act(() => {
        result.current.clearNotifications();
      });

      expect(result.current.notifications).toHaveLength(0);
    });
  });
});

import { vi } from "vitest";

export function createPanResponderMock() {
  return {
    create: vi.fn((config: any = {}) => ({
      panHandlers: {
        onStartShouldSetResponder: config.onStartShouldSetPanResponder
          ? vi.fn((...args: any[]) => config.onStartShouldSetPanResponder(...args))
          : vi.fn(() => false),
        onMoveShouldSetResponder: config.onMoveShouldSetPanResponder
          ? vi.fn((...args: any[]) => config.onMoveShouldSetPanResponder(...args))
          : vi.fn(() => false),
        onStartShouldSetResponderCapture: config.onStartShouldSetPanResponderCapture
          ? vi.fn((...args: any[]) => config.onStartShouldSetPanResponderCapture(...args))
          : vi.fn(() => false),
        onMoveShouldSetResponderCapture: config.onMoveShouldSetPanResponderCapture
          ? vi.fn((...args: any[]) => config.onMoveShouldSetPanResponderCapture(...args))
          : vi.fn(() => false),
        onResponderGrant: config.onPanResponderGrant ?? vi.fn(),
        onResponderReject: config.onPanResponderReject ?? vi.fn(),
        onResponderStart: config.onPanResponderStart ?? vi.fn(),
        onResponderMove: config.onPanResponderMove ?? vi.fn(),
        onResponderEnd: config.onPanResponderEnd ?? vi.fn(),
        onResponderRelease: config.onPanResponderRelease ?? vi.fn(),
        onResponderTerminate: config.onPanResponderTerminate ?? vi.fn(),
        onResponderTerminationRequest: config.onPanResponderTerminationRequest ?? vi.fn(() => true),
      },
    })),
  };
}

import { vi } from "vitest";
import { mockFn } from "../mock-fn.js";

export function createAccessibilityInfoMock() {
  return {
    isScreenReaderEnabled: vi.fn(async () => false),
    isBoldTextEnabled: vi.fn(async () => false),
    isGrayscaleEnabled: vi.fn(async () => false),
    isInvertColorsEnabled: vi.fn(async () => false),
    isReduceMotionEnabled: vi.fn(async () => false),
    isReduceTransparencyEnabled: vi.fn(async () => false),
    prefersCrossFadeTransitions: vi.fn(async () => false),
    addEventListener: vi.fn((_eventName: string, _handler: Function) => ({
      remove: mockFn(),
    })),
    announceForAccessibility: mockFn(),
    announceForAccessibilityWithOptions: mockFn(),
    setAccessibilityFocus: mockFn(),
    sendAccessibilityEvent: mockFn(),
    getRecommendedTimeoutMillis: vi.fn(async (originalTimeout: number) => originalTimeout),
  };
}

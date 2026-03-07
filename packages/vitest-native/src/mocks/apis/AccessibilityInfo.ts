import { vi } from "vitest";

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
      remove: vi.fn(),
    })),
    announceForAccessibility: vi.fn(),
    announceForAccessibilityWithOptions: vi.fn(),
    setAccessibilityFocus: vi.fn(),
    sendAccessibilityEvent: vi.fn(),
    getRecommendedTimeoutMillis: vi.fn(async (originalTimeout: number) => originalTimeout),
  };
}

import { vi } from "vitest";

export function createToastAndroidMock() {
  return {
    show: vi.fn(),
    showWithGravity: vi.fn(),
    showWithGravityAndOffset: vi.fn(),
    SHORT: 0 as const,
    LONG: 1 as const,
    TOP: 0 as const,
    BOTTOM: 1 as const,
    CENTER: 2 as const,
  };
}

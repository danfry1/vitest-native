import { mockFn } from "../mock-fn.js";

export function createToastAndroidMock() {
  return {
    show: mockFn(),
    showWithGravity: mockFn(),
    showWithGravityAndOffset: mockFn(),
    SHORT: 0 as const,
    LONG: 1 as const,
    TOP: 0 as const,
    BOTTOM: 1 as const,
    CENTER: 2 as const,
  };
}

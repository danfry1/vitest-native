import { vi } from "vitest";

export function createPixelRatioMock() {
  return {
    get: vi.fn(() => 3),
    getFontScale: vi.fn(() => 1),
    getPixelSizeForLayoutSize: vi.fn((layoutSize: number) => Math.round(layoutSize * 3)),
    roundToNearestPixel: vi.fn((layoutSize: number) => Math.round(layoutSize * 3) / 3),
  };
}

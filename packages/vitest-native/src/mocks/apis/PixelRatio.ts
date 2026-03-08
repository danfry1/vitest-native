import { vi } from "vitest";

type DimensionsGetter = () => { scale: number; fontScale: number };

export function createPixelRatioMock(getDimensions?: DimensionsGetter) {
  const getScale = () => (getDimensions ? getDimensions().scale : 3);
  const getFontScale = () =>
    getDimensions ? getDimensions().fontScale : 1;

  return {
    get: vi.fn(() => getScale()),
    getFontScale: vi.fn(() => getFontScale()),
    getPixelSizeForLayoutSize: vi.fn(
      (layoutSize: number) => Math.round(layoutSize * getScale()),
    ),
    roundToNearestPixel: vi.fn((layoutSize: number) => {
      const ratio = getScale();
      return Math.round(layoutSize * ratio) / ratio;
    }),
  };
}

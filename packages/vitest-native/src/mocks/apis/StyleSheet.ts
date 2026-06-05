import { vi } from "vitest";

function flattenImpl(style: any): any {
  if (style == null || style === false) return undefined;

  if (!Array.isArray(style)) return style;

  const result: Record<string, any> = {};
  let hasAny = false;
  for (const item of style) {
    const flattened = flattenImpl(item);
    if (flattened != null) {
      hasAny = true;
      Object.assign(result, flattened);
    }
  }
  return hasAny ? result : undefined;
}

export function createStyleSheetMock(getScale: () => number = () => 3) {
  const sheet = {
    create: vi.fn(<T extends Record<string, any>>(styles: T): T => {
      return styles;
    }),
    flatten: vi.fn((style: any) => flattenImpl(style)),
    compose: vi.fn((a: any, b: any) => [a, b]),
    absoluteFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any,
    absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any,
    setStyleAttributePreprocessor: vi.fn(),
  };
  // Mirrors react-native/Libraries/StyleSheet/StyleSheetExports.js: the thinnest
  // line the device can draw, derived from the pixel ratio (not a hardcoded
  // constant). Exposed as a getter so it tracks the current scale, like the rest
  // of the dimension-derived mocks (PixelRatio).
  Object.defineProperty(sheet, "hairlineWidth", {
    enumerable: true,
    configurable: true,
    get() {
      const ratio = getScale();
      const width = Math.round(0.4 * ratio) / ratio;
      return width === 0 ? 1 / ratio : width;
    },
  });
  return sheet as typeof sheet & { hairlineWidth: number };
}

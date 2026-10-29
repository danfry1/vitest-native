import { vi } from "vitest";
import { mockFn } from "../mock-fn.js";

// Mirrors react-native/Libraries/StyleSheet/flattenStyle.js: anything that is not an
// object (null, false, a number, a string) is no style and flattens to undefined; an
// array always flattens to an object, `{}` when nothing in it is a style.
function flattenInto(result: Record<string, any>, styles: readonly any[]): void {
  for (const style of styles) {
    if (style === null || typeof style !== "object") continue;
    if (Array.isArray(style)) flattenInto(result, style);
    else Object.assign(result, style);
  }
}

function flattenImpl(style: any): any {
  if (style === null || typeof style !== "object") return undefined;
  if (!Array.isArray(style)) return style;
  const result: Record<string, any> = {};
  flattenInto(result, style);
  return result;
}

// Mirrors react-native/src/private/styles/composeStyles.js: a nullish side yields the
// other side itself, and only two present styles make an array.
function composeImpl(style1: any, style2: any): any {
  if (style1 == null) return style2;
  if (style2 == null) return style1;
  return [style1, style2];
}

export function createStyleSheetMock(getScale: () => number = () => 3) {
  const sheet = {
    create: vi.fn(<T extends Record<string, any>>(styles: T): T => {
      return styles;
    }),
    flatten: vi.fn((style: any) => flattenImpl(style)),
    compose: vi.fn((a: any, b: any) => composeImpl(a, b)),
    absoluteFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any,
    absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any,
    setStyleAttributePreprocessor: mockFn(),
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

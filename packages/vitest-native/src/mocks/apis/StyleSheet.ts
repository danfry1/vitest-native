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

export function createStyleSheetMock() {
  return {
    create: vi.fn(<T extends Record<string, any>>(styles: T): T => {
      return styles;
    }),
    flatten: vi.fn((style: any) => flattenImpl(style)),
    compose: vi.fn((a: any, b: any) => [a, b]),
    absoluteFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any,
    absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any,
    hairlineWidth: 0.5,
    setStyleAttributePreprocessor: vi.fn(),
  };
}

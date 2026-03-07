import { vi } from "vitest";

export function createStyleSheetMock() {
  return {
    create: vi.fn(<T extends Record<string, any>>(styles: T): T => {
      return styles;
    }),
    flatten: vi.fn((...args: any[]) => Object.assign({}, ...args.flat(Infinity).filter(Boolean))),
    compose: vi.fn((a: any, b: any) => [a, b]),
    absoluteFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any,
    absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any,
    hairlineWidth: 0.5,
    setStyleAttributePreprocessor: vi.fn(),
  };
}

import { vi } from "vitest";

type DimensionValue = { width: number; height: number; scale: number; fontScale: number };
type DimensionKey = "window" | "screen";

export function createDimensionsMock() {
  const defaults: Record<DimensionKey, DimensionValue> = {
    window: { width: 390, height: 844, scale: 3, fontScale: 1 },
    screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
  };

  const state: Record<DimensionKey, DimensionValue> = {
    window: { ...defaults.window },
    screen: { ...defaults.screen },
  };

  const listeners = new Set<(dims: Record<DimensionKey, DimensionValue>) => void>();

  return {
    get: vi.fn((dim: DimensionKey) => ({ ...state[dim] })),
    set: vi.fn((dims: Partial<Record<DimensionKey, Partial<DimensionValue>>>) => {
      for (const [key, value] of Object.entries(dims)) {
        if (key in state && value) {
          Object.assign(state[key as DimensionKey], value);
        }
      }
      listeners.forEach((fn) => fn({ window: { ...state.window }, screen: { ...state.screen } }));
    }),
    addEventListener: vi.fn((_type: string, handler: Function) => {
      listeners.add(handler as any);
      return { remove: () => listeners.delete(handler as any) };
    }),
    _reset: () => {
      Object.assign(state.window, defaults.window);
      Object.assign(state.screen, defaults.screen);
      listeners.clear();
    },
  };
}

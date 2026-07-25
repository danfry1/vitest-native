import { vi } from "vitest";

/** Resting colour scheme, written once — see Keyboard.ts for why not twice. */
const RESTING_SCHEME: "light" | "dark" = "light";

export function createAppearanceMock() {
  let colorScheme: "light" | "dark" = RESTING_SCHEME;
  const listeners = new Set<Function>();

  return {
    getColorScheme: vi.fn(() => colorScheme),
    setColorScheme: vi.fn((scheme: "light" | "dark") => {
      colorScheme = scheme;
      listeners.forEach((fn) => fn({ colorScheme: scheme }));
    }),
    addChangeListener: vi.fn((listener: Function) => {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    }),
    _reset: () => {
      colorScheme = RESTING_SCHEME;
      listeners.clear();
    },
  };
}

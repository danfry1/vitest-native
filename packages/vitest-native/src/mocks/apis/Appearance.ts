import { vi } from "vitest";

export function createAppearanceMock() {
  let colorScheme: "light" | "dark" = "light";
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
      colorScheme = "light";
      listeners.clear();
    },
  };
}

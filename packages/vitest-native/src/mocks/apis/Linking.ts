import { vi } from "vitest";

export function createLinkingMock() {
  return {
    openURL: vi.fn(() => Promise.resolve()),
    canOpenURL: vi.fn(() => Promise.resolve(true)),
    getInitialURL: vi.fn(() => Promise.resolve(null)),
    openSettings: vi.fn(() => Promise.resolve()),
    sendIntent: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  };
}

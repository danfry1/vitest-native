import { vi } from "vitest";

export function createLogBoxMock() {
  return {
    ignoreLogs: vi.fn(),
    ignoreAllLogs: vi.fn(),
    uninstall: vi.fn(),
    install: vi.fn(),
  };
}

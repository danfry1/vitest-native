import { vi } from "vitest";

export function createVibrationMock() {
  return {
    vibrate: vi.fn(),
    cancel: vi.fn(),
  };
}

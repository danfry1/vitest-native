import { vi } from "vitest";

export function createAlertMock() {
  return {
    alert: vi.fn(),
    prompt: vi.fn(),
  };
}

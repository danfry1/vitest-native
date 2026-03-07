import { vi } from "vitest";

export function createActionSheetIOSMock() {
  return {
    showActionSheetWithOptions: vi.fn(),
    showShareActionSheetWithOptions: vi.fn(),
  };
}

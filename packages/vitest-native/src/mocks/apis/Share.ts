import { vi } from "vitest";

export function createShareMock() {
  return {
    share: vi.fn(async () => ({ action: "sharedAction" })),
    sharedAction: "sharedAction" as const,
    dismissedAction: "dismissedAction" as const,
  };
}

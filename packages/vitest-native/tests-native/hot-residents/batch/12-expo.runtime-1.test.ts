import { test } from "vitest";

test("adds to Expo's native runtime object and leaves it", () => {
  (globalThis as unknown as { expo: Record<string, unknown> }).expo.vnAudit = {};
});

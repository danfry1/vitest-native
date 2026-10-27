import { expect, test } from "vitest";

// Expo's table of the native modules differs by SDK, and the native engine answers from
// the installed SDK's (expo-module-table-57.mjs here), as SDK 57's jest-expo does. SDK
// 58's table gives this constant another value.
test("answers native modules from SDK 57's table", () => {
  const modules = (globalThis as { expo: { modules: Record<string, any> } }).expo.modules;
  expect(modules.EASClient.deterministicUniformValue).toBe(0.707423611086654);
  // A module an installed package only probes for (expo-updates is not installed) stays
  // absent, whatever the table lists for it.
  expect(modules.ExpoUpdates).toBeUndefined();
});

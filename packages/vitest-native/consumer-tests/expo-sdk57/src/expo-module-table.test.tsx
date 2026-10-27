import { expect, test } from "vitest";

// Expo's table of the native modules differs by SDK, and the native engine answers from
// the installed SDK's (expo-module-table-57.mjs here), as SDK 57's jest-expo does. SDK
// 58's table has another value for this constant, and none of SDK 57's ExpoUpdates
// constants below.
test("answers native modules from SDK 57's table", () => {
  const modules = (globalThis as { expo: { modules: Record<string, any> } }).expo.modules;
  expect(modules.EASClient.deterministicUniformValue).toBe(0.707423611086654);
  expect(modules.ExpoUpdates.launchDuration).toBe(137.53902912139893);
  expect(modules.ExpoUpdates.manifest).toEqual({});
  expect(modules.ExpoUpdates.updateId).toBe("mock");
});

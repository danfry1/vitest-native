/**
 * The original failure: no jest-compat layer and no `jest` global at all, and an Expo
 * module's `mocks/<NativeModule>` file that calls `jest.fn` and `jest.requireActual`
 * still loads. The mock engine has no Expo module resolver, so nothing to check there.
 */
import { it } from "vitest";
import { defineExpoModuleMockCases } from "../support/expo-module-mock-cases";

if (process.env.VN_NO_GLOBALS_MODE === "mock-noiso") {
  it.skip("an Expo module's own native-module mock (native engine only)", () => {});
} else {
  defineExpoModuleMockCases();
}

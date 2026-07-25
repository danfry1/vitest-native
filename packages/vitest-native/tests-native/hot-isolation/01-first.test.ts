import { Appearance, DeviceEventEmitter, NativeModules } from "react-native";
import { afterAll, expect, it } from "vitest";

// Order-independent, like every other file in this directory. Vitest orders test
// files by cached duration, not by name, so the numeric prefixes here are a reading
// aid and nothing more — the observed order varies run to run even with
// `fileParallelism: false`, `maxWorkers: 1` and `sequence.shuffle: false`.
//
// This file and 02 are therefore SYMMETRIC: each asserts it inherited nothing, then
// leaves the same pollution behind, so whichever runs second catches a leak. While
// only one of the pair produced the pollution and only the other checked for it,
// running them in the other order made the check vacuous and the suite stayed green
// — the exact failure this suite exists to detect.
const globalKey = "__VN_HOT_ISOLATION_OWNER__";
const envKey = "VITEST_USER_HOT_ISOLATION_OWNER";
const eventName = "vn-hot-isolation-event";

const inheritedGlobal = (globalThis as Record<string, unknown>)[globalKey];
const inheritedEnv = process.env[envKey];
const inheritedListeners = DeviceEventEmitter.listenerCount(eventName);
const inheritedColorScheme = Appearance.getColorScheme();
// Read the boundary stub DIRECTLY, bypassing RN's JS-side appearance cache: the
// other file leaves a dead override on this stub's setColorScheme, so if the hot
// reset value-restores BEFORE clearing stub overrides, the restore is swallowed and
// this read leaks "dark" while the JS cache says "light".
const inheritedNativeColorScheme = NativeModules.Appearance.getColorScheme();

(globalThis as Record<string, unknown>)[globalKey] = "first";
process.env[envKey] = "first";
DeviceEventEmitter.addListener(eventName, () => {});
Appearance.setColorScheme("dark");

it("starts without state from another test file", () => {
  expect(inheritedGlobal).toBeUndefined();
  expect(inheritedEnv).toBeUndefined();
  expect(inheritedListeners).toBe(0);
  expect(inheritedColorScheme).toBe("light");
  expect(inheritedNativeColorScheme).toBe("light");
  expect(Appearance.getColorScheme()).toBe("dark");
});

it("does not inherit the other file's boundary-stub override", () => {
  // If the dead no-op override survived a reset, this write would be swallowed.
  NativeModules.Appearance.setColorScheme("dark");
  expect(NativeModules.Appearance.getColorScheme()).toBe("dark");
});

// See 02 — installed after this file's own assertions so it pollutes the next file.
afterAll(() => {
  (NativeModules.Appearance as Record<string, unknown>).setColorScheme = () => {};
});

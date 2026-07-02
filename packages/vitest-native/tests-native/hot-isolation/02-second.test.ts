import { Appearance, DeviceEventEmitter, NativeModules } from "react-native";
import { expect, it } from "vitest";

const globalKey = "__VN_HOT_ISOLATION_OWNER__";
const envKey = "VITEST_USER_HOT_ISOLATION_OWNER";
const eventName = "vn-hot-isolation-event";

const inheritedGlobal = (globalThis as Record<string, unknown>)[globalKey];
const inheritedEnv = process.env[envKey];
const inheritedListeners = DeviceEventEmitter.listenerCount(eventName);
const inheritedColorScheme = Appearance.getColorScheme();
// Read the boundary stub DIRECTLY, bypassing RN's JS-side appearance cache:
// file 1 left a dead override on this stub's setColorScheme, so if the hot
// reset value-restores BEFORE clearing stub overrides, the restore is
// swallowed and this read leaks "dark" while the JS cache says "light".
const inheritedNativeColorScheme = NativeModules.Appearance.getColorScheme();

(globalThis as Record<string, unknown>)[globalKey] = "second";
process.env[envKey] = "second";
DeviceEventEmitter.addListener(eventName, () => {});
DeviceEventEmitter.emit("appearanceChanged", { colorScheme: "dark" });

it("starts without state from another test file", () => {
  expect(inheritedGlobal).toBeUndefined();
  expect(inheritedEnv).toBeUndefined();
  expect(inheritedListeners).toBe(0);
  // File 1 set "dark" AND left a dead override on the Appearance stub; both
  // must be gone — the reset clears stub overrides before the value-restore.
  expect(inheritedColorScheme).toBe("light");
  expect(inheritedNativeColorScheme).toBe("light");
  expect(Appearance.getColorScheme()).toBe("dark");
});

it("does not inherit the previous file's boundary-stub override", () => {
  // File 1 replaced NativeModules.Appearance.setColorScheme with a no-op. If
  // that override survived, this write would be swallowed.
  NativeModules.Appearance.setColorScheme("dark");
  expect(NativeModules.Appearance.getColorScheme()).toBe("dark");
});

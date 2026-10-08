import { Appearance, DeviceEventEmitter, NativeModules, TurboModuleRegistry } from "react-native";
import { afterAll, expect, it } from "vitest";
import { mockNativeModule } from "vitest-native/helpers";

// The symmetric partner of 01 — see the comment there for why both files leave the
// same pollution behind instead of one producing it and the other checking for it.
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
// See 01: a module the other file registered and never reset must be absent here.
const inheritedRegisteredModule = {
  nativeModules: NativeModules.VNHotRegisteredProbe,
  turboModule: TurboModuleRegistry.get("VNHotRegisteredProbe"),
};

(globalThis as Record<string, unknown>)[globalKey] = "second";
process.env[envKey] = "second";
DeviceEventEmitter.addListener(eventName, () => {});
DeviceEventEmitter.emit("appearanceChanged", { colorScheme: "dark" });

it("starts without state from another test file", () => {
  expect(inheritedGlobal).toBeUndefined();
  expect(inheritedEnv).toBeUndefined();
  expect(inheritedListeners).toBe(0);
  // The other file set "dark" AND left a dead override on the Appearance stub; both
  // must be gone — the reset clears stub overrides before the value-restore.
  expect(inheritedColorScheme).toBe("light");
  expect(inheritedNativeColorScheme).toBe("light");
  expect(inheritedRegisteredModule).toEqual({ nativeModules: undefined, turboModule: null });
  expect(Appearance.getColorScheme()).toBe("dark");
});

it("does not inherit the other file's boundary-stub override", () => {
  // If the dead no-op override survived a reset, this write would be swallowed.
  NativeModules.Appearance.setColorScheme("dark");
  expect(NativeModules.Appearance.getColorScheme()).toBe("dark");
});

// Leave a DEAD override on the boundary stub, un-restored, for whichever file runs
// next. The hot reset must clear stub overrides BEFORE the colorScheme
// value-restore — restoring first would route the restore through this no-op and
// leak "dark" (demonstrated in review of the spy-able-turboStubs change). Installed
// after this file's own assertions so it pollutes the next file, not this one.
afterAll(() => {
  (NativeModules.Appearance as Record<string, unknown>).setColorScheme = () => {};
  mockNativeModule("VNHotRegisteredProbe", { owner: "second" });
});

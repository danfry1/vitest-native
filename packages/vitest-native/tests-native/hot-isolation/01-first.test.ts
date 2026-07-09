import { Appearance, DeviceEventEmitter, NativeModules } from "react-native";
import { expect, it } from "vitest";

const globalKey = "__VN_HOT_ISOLATION_OWNER__";
const envKey = "VITEST_USER_HOT_ISOLATION_OWNER";
const eventName = "vn-hot-isolation-event";

const inheritedGlobal = (globalThis as Record<string, unknown>)[globalKey];
const inheritedEnv = process.env[envKey];
const inheritedListeners = DeviceEventEmitter.listenerCount(eventName);
const inheritedColorScheme = Appearance.getColorScheme();

(globalThis as Record<string, unknown>)[globalKey] = "first";
process.env[envKey] = "first";
DeviceEventEmitter.addListener(eventName, () => {});
Appearance.setColorScheme("dark");
// Leave a DEAD override on the boundary stub, un-restored. The next file's
// hot reset must clear stub overrides BEFORE the colorScheme value-restore —
// restoring first would route the restore through this no-op and leak "dark"
// into file 2 (demonstrated in review of the spy-able-turboStubs change).
(NativeModules.Appearance as Record<string, unknown>).setColorScheme = () => {};

it("starts without state from another test file", () => {
  expect(inheritedGlobal).toBeUndefined();
  expect(inheritedEnv).toBeUndefined();
  expect(inheritedListeners).toBe(0);
  expect(inheritedColorScheme).toBe("light");
  expect(Appearance.getColorScheme()).toBe("dark");
});

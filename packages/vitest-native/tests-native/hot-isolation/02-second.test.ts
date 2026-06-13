import { Appearance, DeviceEventEmitter } from "react-native";
import { expect, it } from "vitest";

const globalKey = "__VN_HOT_ISOLATION_OWNER__";
const envKey = "VITEST_USER_HOT_ISOLATION_OWNER";
const eventName = "vn-hot-isolation-event";

const inheritedGlobal = (globalThis as Record<string, unknown>)[globalKey];
const inheritedEnv = process.env[envKey];
const inheritedListeners = DeviceEventEmitter.listenerCount(eventName);
const inheritedColorScheme = Appearance.getColorScheme();

(globalThis as Record<string, unknown>)[globalKey] = "second";
process.env[envKey] = "second";
DeviceEventEmitter.addListener(eventName, () => {});
DeviceEventEmitter.emit("appearanceChanged", { colorScheme: "dark" });

it("starts without state from another test file", () => {
  expect(inheritedGlobal).toBeUndefined();
  expect(inheritedEnv).toBeUndefined();
  expect(inheritedListeners).toBe(0);
  expect(inheritedColorScheme).toBe("light");
  expect(Appearance.getColorScheme()).toBe("dark");
});

import { expect, test } from "vitest";
import { Appearance, DeviceEventEmitter, Dimensions } from "react-native";

// Each assertion fails iff the previous file's pollution survived the per-file
// reset. Under the default engine these pass trivially (fresh worker per file);
// under hot they pass only if reset.mjs restored each surface.
test("resident Dimensions were restored (not the polluted 9999)", () => {
  expect(Dimensions.get("window").width).not.toBe(9999);
});

test("Appearance color scheme was restored (not the polluted dark)", () => {
  expect(Appearance.getColorScheme?.()).not.toBe("dark");
});

test("process.env mutation did not bleed across files", () => {
  expect(process.env.BLEED_ENV_a1b2).toBeUndefined();
});

test("file-created global did not bleed across files", () => {
  expect((globalThis as any).__bleed_global_a1b2).toBeUndefined();
});

test("previous file's event listener was removed (does not fire here)", () => {
  (globalThis as any).__bleed_listener_fired = 0;
  DeviceEventEmitter.emit("BLEED_EVT_a1b2");
  expect((globalThis as any).__bleed_listener_fired).toBe(0);
});

import { test } from "vitest";
import { Appearance, DeviceEventEmitter, Dimensions } from "react-native";

// Pollutes every resident surface the hot per-file reset is supposed to restore.
// bleed-globals-b verifies each one is clean in the next file.
test("pollute resident RN + process + global state", () => {
  Dimensions.set({
    window: { width: 9999, height: 9999, scale: 1, fontScale: 1 },
    screen: { width: 9999, height: 9999, scale: 1, fontScale: 1 },
  });
  try {
    Appearance.setColorScheme?.("dark");
  } catch {}
  process.env.BLEED_ENV_a1b2 = "polluted";
  (globalThis as any).__bleed_global_a1b2 = "polluted";
  DeviceEventEmitter.addListener("BLEED_EVT_a1b2", () => {
    (globalThis as any).__bleed_listener_fired = ((globalThis as any).__bleed_listener_fired ?? 0) + 1;
  });
});

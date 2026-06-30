import { expect } from "vitest";
import { Appearance, DeviceEventEmitter, Dimensions } from "react-native";

// Order-independent cross-file bleed check: every file first asserts each resident
// surface is CLEAN, then pollutes it. Whichever file runs second must see the
// prior file's pollution unless the per-file reset cleared it — so the check fails
// under no-reset regardless of which file runs first (no reliance on file order,
// which Vitest does not pin). Under hot, the reset restores each surface, so both
// files see clean state and pass.
export function assertCleanThenPollute() {
  // 1. assert clean (fails if a prior file's pollution survived the reset)
  expect(Dimensions.get("window").width).not.toBe(9999);
  expect(Appearance.getColorScheme?.()).not.toBe("dark");
  expect(process.env.BLEED_SURFACE).toBeUndefined();
  expect((globalThis as any).__bleed_surface).toBeUndefined();
  expect(DeviceEventEmitter.listenerCount("BLEED_SURFACE_EVT")).toBe(0);

  // 2. pollute every surface (the next file must see all of these reset)
  Dimensions.set({
    window: { width: 9999, height: 9999, scale: 1, fontScale: 1 },
    screen: { width: 9999, height: 9999, scale: 1, fontScale: 1 },
  });
  try {
    Appearance.setColorScheme?.("dark");
  } catch {}
  process.env.BLEED_SURFACE = "polluted";
  (globalThis as any).__bleed_surface = "polluted";
  DeviceEventEmitter.addListener("BLEED_SURFACE_EVT", () => {});
}

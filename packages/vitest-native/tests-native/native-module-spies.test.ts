/**
 * Native modules without a mock are served by identity-stable, spy-able
 * turboStubs. Previously every property access minted a fresh Proxy and the get
 * trap never consulted the target, so `vi.spyOn(NativeModules.X, 'method')`
 * silently recorded nothing — a real pattern in migrated Jest suites.
 *
 * The probes are modules that exist: React Native's own (Vibration and
 * SettingsManager are requested by Libraries/Vibration/NativeVibration.js and
 * src/private/specs_DEPRECATED/modules/NativeSettingsManager.js), or a module
 * required through getEnforcing. A name no app registers is absent from
 * NativeModules, as on a device (see native-module-lookups.test.ts), and React
 * Native's own modules have only their spec's methods, so the probes call those.
 */
import { describe, it, expect, vi } from "vitest";
import { NativeModules, TurboModuleRegistry } from "react-native";

describe("NativeModules stubs under the native engine", () => {
  it("are identity-stable across property accesses", () => {
    expect(NativeModules.Vibration).toBe(NativeModules.Vibration);
    expect(NativeModules.Vibration.vibrate).toBe(NativeModules.Vibration.vibrate);
  });

  it("share identity with TurboModuleRegistry", () => {
    expect(TurboModuleRegistry.get("SettingsManager")).toBe(NativeModules.SettingsManager);
    expect(TurboModuleRegistry.getEnforcing("SettingsManager")).toBe(NativeModules.SettingsManager);
  });

  it("support vi.spyOn on stub methods", () => {
    const spy = vi.spyOn(NativeModules.Vibration, "vibrateByPattern");
    NativeModules.Vibration.vibrateByPattern([0, 100], -1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([0, 100], -1);
    spy.mockRestore();
    expect(NativeModules.Vibration.vibrateByPattern([0], -1)).toBeUndefined();
  });

  it("support vi.spyOn on a module required through getEnforcing", () => {
    const required = TurboModuleRegistry.getEnforcing<{ doThing(...args: unknown[]): unknown }>(
      "VNRequiredSpyProbe",
    );
    expect(TurboModuleRegistry.getEnforcing("VNRequiredSpyProbe")).toBe(required);
    const spy = vi.spyOn(required, "doThing");
    required.doThing("payload");
    expect(spy).toHaveBeenCalledWith("payload");
    spy.mockRestore();
  });

  it("keeps callback/promise conventions after memoization", async () => {
    // Callback-style: success callback is invoked so wrapping Promises settle.
    let called: unknown = "not called";
    NativeModules.AccessibilityManager.getCurrentVoiceOverState(
      (v: unknown) => {
        called = v;
      },
      () => {},
    );
    expect(called).toBe(false);
    // getConstants stays functional on the memoized stub.
    expect(typeof NativeModules.SettingsManager.getConstants()).toBe("object");
  });
});

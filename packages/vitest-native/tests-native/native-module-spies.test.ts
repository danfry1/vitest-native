/**
 * Unmocked native modules are served by identity-stable, spy-able turboStubs.
 * Previously every property access minted a fresh Proxy and the get trap never
 * consulted the target, so `vi.spyOn(NativeModules.X, 'method')` silently
 * recorded nothing — a real pattern in migrated Jest suites.
 */
import { describe, it, expect, vi } from "vitest";
import { NativeModules, TurboModuleRegistry } from "react-native";

describe("NativeModules stubs under the native engine", () => {
  it("are identity-stable across property accesses", () => {
    expect(NativeModules.VNIdentityProbe).toBe(NativeModules.VNIdentityProbe);
    expect(NativeModules.VNIdentityProbe.someMethod).toBe(NativeModules.VNIdentityProbe.someMethod);
  });

  it("share identity with TurboModuleRegistry", () => {
    expect(TurboModuleRegistry.get("VNSharedProbe")).toBe(NativeModules.VNSharedProbe);
  });

  it("support vi.spyOn on stub methods", () => {
    const spy = vi.spyOn(NativeModules.VNSpyProbe, "doThing");
    NativeModules.VNSpyProbe.doThing("payload", 42);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("payload", 42);
    spy.mockRestore();
    expect(NativeModules.VNSpyProbe.doThing("x")).toBeUndefined();
  });

  it("keeps callback/promise conventions after memoization", async () => {
    // Callback-style: success callback is invoked so wrapping Promises settle.
    let called: unknown = "not called";
    NativeModules.VNCallbackProbe.fetchState((v: unknown) => {
      called = v;
    });
    expect(called).toBe(false);
    // getConstants stays functional on the memoized stub.
    expect(typeof NativeModules.VNCallbackProbe.getConstants()).toBe("object");
  });
});

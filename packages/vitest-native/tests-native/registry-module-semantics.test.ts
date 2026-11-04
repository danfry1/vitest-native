import { describe, expect, it } from "vitest";
import { Platform } from "react-native";

// React Native's Babel preset compiles with strictMode: false, so Platform.ios.js has no
// "use strict" and Node (and Jest) run it sloppy: the `constants` getter's cache write to
// a frozen receiver fails silently. The precompiled registry used to make every module
// strict, so the same write threw a TypeError (tests/registry-module-semantics.test.ts
// covers the mechanism on a fixture).
describe("native engine: React Native modules keep Node's semantics", () => {
  it("runs a sloppy React Native module sloppy, as Jest does", () => {
    expect((globalThis as Record<string, unknown>).__vitest_native_registry_installed).toBe(true);
    const frozen = Object.freeze(Object.assign(Object.create(Platform), { __constants: null }));
    expect(() => frozen.constants).not.toThrow();
    expect(frozen.constants).toBeNull();
  });
});

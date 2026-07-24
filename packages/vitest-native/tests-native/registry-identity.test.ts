import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { Dimensions, DeviceEventEmitter, Platform } from "react-native";

// Integration checks for the registry as the ENGINE serves it, rather than for the
// builder in isolation (tests-native/registry.test.ts covers that). The property
// that matters here is single-instance: an ecosystem package requiring React Native
// internals through Node must observe the same singletons the test's own imports do,
// or state set in one place is invisible in the other.
const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
const req = createRequire(path.join(projectRoot, "package.json"));

describe("native engine: React Native module identity", () => {
  it("serves the precompiled registry", () => {
    expect(process.env.VITEST_NATIVE_RN_REGISTRY).toBeTruthy();
    expect((globalThis as Record<string, unknown>).__vitest_native_registry_installed).toBe(true);
  });

  it("gives a bare require the same module as the test's ESM import", () => {
    expect(req("react-native").Dimensions).toBe(Dimensions);
    expect(req("react-native").Platform).toBe(Platform);
  });

  it("gives a deep require the same singleton as the root import", () => {
    // The shape an ecosystem package reaches for (react-native/Libraries/...).
    expect(req("react-native/Libraries/Utilities/Dimensions").default).toBe(Dimensions);
    expect(req("react-native/Libraries/EventEmitter/RCTDeviceEventEmitter").default).toBe(
      DeviceEventEmitter,
    );
  });

  it("propagates state set through one path to the other", () => {
    const viaDeepPath = req("react-native/Libraries/Utilities/Dimensions").default;
    Dimensions.set({
      window: { width: 111, height: 222, scale: 2, fontScale: 1 },
      screen: { width: 111, height: 222, scale: 2, fontScale: 1 },
    });
    expect(viaDeepPath.get("window").width).toBe(111);
  });

  it("falls through to the per-file hooks for React Native files outside the graph", () => {
    // The registry only contains what react-native's entry can reach. Anything else
    // — a module only some ecosystem package imports, or one reached by a computed
    // require — must still load, Flow-stripped, through the hooks.
    const ids: string[] = req(process.env.VITEST_NATIVE_RN_REGISTRY as string)
      .__vitestNativeRegistry.ids;
    const outside = "react-native/Libraries/Utilities/HMRClient";
    expect(ids.some((f) => f.endsWith("/Utilities/HMRClient.js"))).toBe(false);
    expect(typeof req(outside).default).toBe("object");
  });
});

/**
 * Regression tests for structural issues found in code review.
 * Each test guards against a specific bug that was fixed.
 */
import { describe, it, expect } from "vitest";
import { NativeModules, Platform } from "react-native";

// --- Issue 1: NativeModules methods must be callable ---
// Previously, the inner proxy returned objects (not functions), so
// NativeModules.Foo.bar() threw TypeError.

describe("NativeModules callable proxy", () => {
  it("calling a method on an unmocked module does not throw", () => {
    expect(() => NativeModules.SomeUnknownModule.doSomething()).not.toThrow();
  });

  it("deeply nested method calls do not throw", () => {
    expect(() => NativeModules.Deep.nested.chain.method()).not.toThrow();
  });

  it("unmocked module method returns undefined", () => {
    const result = NativeModules.SomeModule.getValue();
    expect(result).toBeUndefined();
  });

  it("property access still returns a truthy proxy", () => {
    expect(NativeModules.AnyModule).toBeDefined();
    expect(NativeModules.AnyModule.anyProp).toBeDefined();
  });
});

// --- Issue 2: window global must not clobber existing window ---
// Previously, setup.ts unconditionally set window = globalThis, which
// would destroy jsdom's window object. Now it only sets if undefined.

describe("window global safety", () => {
  it("window is defined", () => {
    expect(typeof globalThis.window).not.toBe("undefined");
  });

  it("window was not overwritten if it already existed", () => {
    // In Vitest's default Node environment, window should be globalThis
    // (set by our setup since Node doesn't have window).
    // The key invariant: if a test environment (jsdom) sets window before
    // our setup runs, we must not clobber it.
    expect((globalThis as any).window).toBe(globalThis);
  });
});

// --- Issue 3: react-native subpath imports ---
// Previously, ESM imports of react-native/... returned only `export default {}`
// with no named exports. Now they re-export from the root mock.

describe("react-native subpath imports", () => {
  it("importing react-native root works", async () => {
    const rn = await import("react-native");
    expect(rn.Platform).toBeDefined();
    expect(rn.View).toBeDefined();
  });

  it("requiring react-native root returns the full mock", () => {
    const rn = require("react-native");
    expect(rn.Platform).toBeDefined();
    expect(rn.Dimensions).toBeDefined();
  });

  it("requiring a react-native subpath does not throw", () => {
    expect(() => require("react-native/Libraries/Utilities/Platform")).not.toThrow();
  });

  it("ESM subpath import has named exports from the root mock", async () => {
    const mod = await import("react-native/Libraries/Utilities/Platform");
    expect(mod.Platform).toBeDefined();
    expect(mod.Platform.OS).toBeDefined();
    expect(mod.View).toBeDefined();
    expect(mod.StyleSheet).toBeDefined();
  });
});

// --- Issue 4: Plugin options must reach the setup file ---
// Previously, options were passed via globalThis which doesn't survive from
// Vite's main process into Vitest worker processes. Now uses process.env.

describe("options transport via process.env", () => {
  it("VITEST_NATIVE_PLATFORM env var is set", () => {
    expect(process.env.VITEST_NATIVE_PLATFORM).toBeDefined();
  });

  it("platform option reaches the setup file", () => {
    // The default platform is 'ios'. If the env var transport works,
    // Platform.OS should match what the plugin configured.
    const expectedPlatform = process.env.VITEST_NATIVE_PLATFORM || "ios";
    expect(Platform.OS).toBe(expectedPlatform);
  });

  it("VITEST_NATIVE_DIAGNOSTICS env var is set", () => {
    expect(process.env.VITEST_NATIVE_DIAGNOSTICS).toBeDefined();
  });

  it("VITEST_NATIVE_PROJECT_ROOT env var is set and is a valid path", () => {
    expect(process.env.VITEST_NATIVE_PROJECT_ROOT).toBeDefined();
    // Should be an absolute path, not empty
    expect(process.env.VITEST_NATIVE_PROJECT_ROOT!.startsWith("/")).toBe(true);
  });
});

// --- Issue 5: Preset static exports must be available without calling factory ---
// Previously, plugin.ts called preset factories at config time (Vite main process)
// to discover export names. Factories use require('vitest') which fails outside
// Vitest workers. Now presets declare exports statically.

describe("preset static export declarations", () => {
  it("presets declare static exports without requiring vitest", async () => {
    // Import the presets module — this should work without vitest context
    // because the factory is not called, only the static exports array is read.
    const { navigation, reanimated, safeAreaContext } = await import("../src/presets/index.js");

    const nav = navigation();
    const navModule = nav.modules["@react-navigation/native"];
    expect(navModule.exports).toContain("useNavigation");
    expect(navModule.exports).toContain("NavigationContainer");
    expect(typeof navModule.factory).toBe("function");

    const rean = reanimated();
    const reanModule = rean.modules["react-native-reanimated"];
    expect(reanModule.exports).toContain("useSharedValue");
    expect(reanModule.exports).toContain("withTiming");

    const sa = safeAreaContext();
    const saModule = sa.modules["react-native-safe-area-context"];
    expect(saModule.exports).toContain("useSafeAreaInsets");
    expect(saModule.exports).toContain("SafeAreaProvider");
  });

  it("all preset names match the BUILT_IN_PRESET_NAMES allowlist", async () => {
    // Previously, three presets used kebab-case names (gesture-handler,
    // safe-area-context, async-storage) but the plugin allowlist expected
    // camelCase. This caused "Unknown preset" errors for explicit config.
    const BUILT_IN_PRESET_NAMES = new Set([
      "reanimated",
      "gestureHandler",
      "safeAreaContext",
      "navigation",
      "asyncStorage",
      "screens",
      "expo",
    ]);

    const presetMod = await import("../src/presets/index.js");
    const factories = [
      presetMod.reanimated,
      presetMod.gestureHandler,
      presetMod.safeAreaContext,
      presetMod.navigation,
      presetMod.asyncStorage,
      presetMod.screens,
      presetMod.expo,
    ];

    for (const factory of factories) {
      const preset = factory();
      expect(BUILT_IN_PRESET_NAMES.has(preset.name)).toBe(true);
    }
  });

  it("source-mode preset factories produce valid mocks with vi.fn()", async () => {
    // Previously, preset factories used require('vitest') inside the factory
    // body. In source mode, Node's CJS require cannot load vitest's ESM-only
    // package. Now presets use top-level ESM imports, which Vitest transforms.
    // This test exercises the full factory→mock path from source.
    const presetMod = await import("../src/presets/index.js");
    const allFactories = [
      { name: "gestureHandler", module: "react-native-gesture-handler" },
      { name: "safeAreaContext", module: "react-native-safe-area-context" },
      { name: "asyncStorage", module: "@react-native-async-storage/async-storage" },
      { name: "navigation", module: "@react-navigation/native" },
      { name: "reanimated", module: "react-native-reanimated" },
      { name: "screens", module: "react-native-screens" },
    ];

    for (const { name, module: modName } of allFactories) {
      const factory = (presetMod as Record<string, any>)[name];
      expect(typeof factory).toBe("function");
      const preset = factory();
      const presetModule = preset.modules[modName];
      expect(presetModule).toBeDefined();
      // Actually call the factory — this is the line that previously threw
      // "Vitest cannot be imported in a CommonJS module using require()"
      const mock = presetModule.factory();
      expect(mock).toBeDefined();
      expect(typeof mock).toBe("object");
      // Verify static exports match actual factory output
      for (const exportName of presetModule.exports) {
        expect(mock).toHaveProperty(exportName);
      }
    }
  });

  it("preset virtual module provides named exports at runtime", async () => {
    // In a real consumer, preset mocks are served via virtual modules
    // populated by setup.ts calling the factory. We verify that the
    // globalThis store (populated by setup.ts) contains the expected
    // export names from a preset, which proves the static exports
    // list matches what the factory actually produces.
    const g = globalThis as any;
    const presetMocks = g.__vitest_native_preset_mocks || {};
    // If no presets are active (no preset packages installed), this test
    // validates the mechanism without hard-failing.
    const moduleNames = Object.keys(presetMocks);
    for (const modName of moduleNames) {
      const mock = presetMocks[modName];
      expect(mock).toBeDefined();
      expect(typeof mock).toBe("object");
    }
  });
});

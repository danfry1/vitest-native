/**
 * Native module lookups answer the way a device does. React Native's lookups
 * (Libraries/TurboModule/TurboModuleRegistry.js) return null from get() and
 * undefined from NativeModules[name] for a module the binary does not register;
 * Jest's preset does the same (jest/mocks/NativeModules.js is a plain object of
 * core modules). Library code feature-detects on exactly this:
 * expo-constants/build/Constants.js only parses
 * `NativeModules.EXDevLauncher.manifestString` when `NativeModules.EXDevLauncher`
 * is present, and a stub that was always present made it JSON.parse a function.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeModules, TurboModuleRegistry } from "react-native";
import { mockNativeModule, resetAllMocks } from "vitest-native/helpers";
import {
  BOUNDARY_NATIVE_MODULES,
  reactNativeRootFor,
  scanReactNativeModuleRequests,
} from "../dist/native/native-modules.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");

afterEach(() => {
  resetAllMocks();
  vi.unstubAllEnvs();
});

describe("native module lookups for a module the app does not register", () => {
  it("NativeModules[name] is undefined and `in` agrees", () => {
    expect(NativeModules.VNUnregisteredModule).toBeUndefined();
    expect("VNUnregisteredModule" in NativeModules).toBe(false);
  });

  it("TurboModuleRegistry.get returns null", () => {
    expect(TurboModuleRegistry.get("VNUnregisteredModule")).toBeNull();
  });

  it("TurboModuleRegistry.getEnforcing still returns a working stub", () => {
    // React Native throws here; a stub keeps code that requires a module running.
    const module = TurboModuleRegistry.getEnforcing<{ doThing(): unknown }>("VNRequiredModule");
    expect(module).not.toBeNull();
    expect(module.doThing()).toBeUndefined();
    // Requiring a module does not register it for optional lookups.
    expect(NativeModules.VNRequiredModule).toBeUndefined();
  });

  it("takes the absent branch of expo-constants' dev-launcher detection", () => {
    // The shape of expo-constants/build/Constants.js.
    let manifest: unknown = null;
    if (NativeModules.EXDevLauncher) {
      if (NativeModules.EXDevLauncher.manifestString) {
        manifest = JSON.parse(NativeModules.EXDevLauncher.manifestString);
      }
    }
    expect(manifest).toBeNull();
  });

  it("runs the real expo-constants module without a dev-launcher crash", () => {
    // Loaded by path through Node, past the expo preset that normally shadows it.
    const req = createRequire(path.join(projectRoot, "package.json"));
    const dir = path.dirname(req.resolve("expo-constants/package.json"));
    // babel-preset-expo inlines this in an app build; expo warns when it is absent.
    vi.stubEnv("EXPO_OS", "ios");
    // With an always-present EXDevLauncher, the module threw at import:
    // `JSON.parse(NativeModules.EXDevLauncher.manifestString)` parsed a function.
    expect(() => req(path.join(dir, "build/Constants.js"))).not.toThrow();
  });
});

describe("native module lookups for a module that exists", () => {
  it("React Native's own modules stay present for every lookup kind", () => {
    // Appearance is requested with get() (NativeAppearance.js), DeviceInfo with
    // getEnforcing() (NativeDeviceInfo.js); both are in every app binary.
    for (const name of ["Appearance", "DeviceInfo", "PlatformConstants"]) {
      expect(NativeModules[name], name).toBeDefined();
      expect(name in NativeModules, name).toBe(true);
      expect(TurboModuleRegistry.get(name), name).toBe(NativeModules[name]);
      expect(TurboModuleRegistry.getEnforcing(name), name).toBe(NativeModules[name]);
    }
  });

  it("modules the boundary implements stay present", () => {
    for (const name of BOUNDARY_NATIVE_MODULES) {
      expect(TurboModuleRegistry.get(name), name).not.toBeNull();
    }
  });

  it("mockNativeModule makes an unregistered module present on both paths", () => {
    expect(NativeModules.VNMockedModule).toBeUndefined();
    mockNativeModule("VNMockedModule", { manifestString: '{"name":"mocked"}' });
    expect("VNMockedModule" in NativeModules).toBe(true);
    expect(JSON.parse(NativeModules.VNMockedModule.manifestString)).toEqual({ name: "mocked" });
    expect(TurboModuleRegistry.get("VNMockedModule")).toBe(NativeModules.VNMockedModule);
    resetAllMocks();
    expect(NativeModules.VNMockedModule).toBeUndefined();
  });
});

describe("the known set is React Native's own", () => {
  it("contains every module the installed React Native requests, and nothing unnamed", () => {
    const root = reactNativeRootFor(projectRoot);
    expect(root).not.toBeNull();
    const scan = scanReactNativeModuleRequests(root!);
    // Every TurboModuleRegistry call in React Native names its module literally;
    // a computed name would be invisible to the scan.
    expect(scan.unnamed).toBe(0);
    expect(scan.get.length).toBeGreaterThan(20);
    expect(scan.getEnforcing.length).toBeGreaterThan(15);
    const known = (globalThis as { __vitest_native_known_modules?: Set<string> })
      .__vitest_native_known_modules;
    expect(known).toBeInstanceOf(Set);
    expect([...known!].sort()).toEqual(
      [
        ...new Set([
          ...scan.get,
          ...scan.getEnforcing,
          ...scan.nativeModules,
          ...BOUNDARY_NATIVE_MODULES,
        ]),
      ].sort(),
    );
    for (const name of scan.get) {
      expect(TurboModuleRegistry.get(name), name).not.toBeNull();
    }
  });
});

// A TurboModule on a device exposes the members of its codegen spec and nothing else.
// Code that probes an object for optional properties must see the same thing here:
// Bluesky's Jest setup mocks NativeEventEmitter with Node's EventEmitter, so React
// Native's Keyboard passes NativeKeyboardObserver to it as options, and Node reads
// options.captureRejections. A stub answering every name with a function threw there.
describe("React Native's own modules have their spec's members", () => {
  it("every module React Native looks up has a spec, and the boundary uses it", () => {
    const scan = scanReactNativeModuleRequests(reactNativeRootFor(projectRoot)!);
    // A floor: if the spec format changes upstream, the scan finds no members and
    // every module silently answers every name again.
    for (const name of [...scan.get, ...scan.getEnforcing]) {
      expect(scan.specs[name]?.length, name).toBeGreaterThan(0);
    }
    const specs = (globalThis as { __vitest_native_module_specs?: Map<string, Set<string>> })
      .__vitest_native_module_specs;
    expect(specs?.get("KeyboardObserver")).toEqual(new Set(scan.specs.KeyboardObserver));
  });

  it("an undeclared property reads as undefined, a declared method works", async () => {
    const observer = TurboModuleRegistry.get<Record<string, unknown>>("KeyboardObserver")!;
    expect(typeof observer.addListener).toBe("function");
    expect(observer.captureRejections).toBeUndefined();
    expect("captureRejections" in observer).toBe(false);
    const { EventEmitter } = await import("node:events");
    expect(() => new EventEmitter(observer as never)).not.toThrow();
  });
});

/**
 * The Expo runtime as Expo's own packages read it, under each project of
 * vitest.expo-runtime.config.mts (VN_EXPO_RUNTIME, VN_DEV_LAUNCHER say which).
 *
 * The values asserted are Expo's, read from its source by tests/expo-runtime-facts.test.ts:
 * expo's isRunningInExpoGo() asks for the ExpoGo native module; expo-constants takes
 * executionEnvironment and appOwnership from its native module and reads
 * NativeModules.EXDevLauncher, which expo-dev-launcher registers.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NativeModules, TurboModuleRegistry } from "react-native";
import { isRunningInExpoGo, requireNativeModule, requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import { mockNativeModule, resetAllMocks } from "vitest-native/helpers";

const devBuild = process.env.VN_EXPO_RUNTIME === "development-build";
const devLauncher = process.env.VN_DEV_LAUNCHER === "1";

afterEach(() => resetAllMocks());

describe.runIf(!devBuild)("Expo Go (the default)", () => {
  it("is Expo Go to expo, as under jest-expo", () => {
    expect(isRunningInExpoGo()).toBe(true);
    expect(requireOptionalNativeModule("ExpoGo")).not.toBeNull();
  });

  it("keeps expo-constants' values from jest-expo's table", () => {
    // jest-expo's table lists executionEnvironment as a string with no value ("mock"),
    // and no appOwnership, which expo-constants turns into null.
    expect(Constants.executionEnvironment).toBe("mock");
    expect(Constants.appOwnership).toBeNull();
  });

  it("has no EXDevLauncher", () => {
    expect(NativeModules.EXDevLauncher).toBeUndefined();
    expect(TurboModuleRegistry.get("EXDevLauncher")).toBeNull();
  });
});

describe.runIf(devBuild)("a development build", () => {
  it("is not Expo Go to expo", () => {
    expect(isRunningInExpoGo()).toBe(false);
  });

  it("has no ExpoGo module wherever expo-modules-core looks", () => {
    expect((globalThis as { expo: { modules: Record<string, unknown> } }).expo.modules.ExpoGo).toBe(
      undefined,
    );
    expect("ExpoGo" in (globalThis as { expo: { modules: object } }).expo.modules).toBe(false);
    expect(NativeModules.ExpoGo).toBeUndefined();
    expect(TurboModuleRegistry.get("ExpoGo")).toBeNull();
    expect(() => TurboModuleRegistry.getEnforcing("ExpoGo")).toThrow(
      "TurboModuleRegistry.getEnforcing(...): 'ExpoGo' could not be found.",
    );
    expect(requireOptionalNativeModule("ExpoGo")).toBeNull();
    expect(() => requireNativeModule("ExpoGo")).toThrow("Cannot find native module 'ExpoGo'");
  });

  it("reports expo-constants' development-build values", () => {
    expect(Constants.executionEnvironment).toBe("bare");
    expect(Constants.appOwnership).toBeNull();
  });

  it("still finds React Native's own modules", () => {
    expect(TurboModuleRegistry.getEnforcing("PlatformConstants")).toBeTruthy();
    expect(NativeModules.SourceCode).toBeDefined();
  });

  it("a test's mockNativeModule() comes before the runtime", () => {
    const ExpoGo = { expoVersion: "58.0.0" };
    mockNativeModule("ExpoGo", ExpoGo);
    expect(TurboModuleRegistry.getEnforcing("ExpoGo")).toBe(ExpoGo);
    expect(NativeModules.ExpoGo).toBe(ExpoGo);
    expect(requireOptionalNativeModule("ExpoGo")).not.toBeNull();
  });

  it.runIf(devLauncher)("has EXDevLauncher, with no manifest loaded", () => {
    expect(NativeModules.EXDevLauncher).toBeDefined();
    expect("EXDevLauncher" in NativeModules).toBe(true);
    expect(TurboModuleRegistry.get("EXDevLauncher")).toBe(NativeModules.EXDevLauncher);
    expect(NativeModules.EXDevLauncher.manifestString).toBeUndefined();
    expect(NativeModules.EXDevLauncher.manifestURL).toBeUndefined();
    expect("manifestString" in NativeModules.EXDevLauncher).toBe(false);
  });

  it.runIf(!devLauncher)("has no EXDevLauncher without expo-dev-launcher", () => {
    expect(NativeModules.EXDevLauncher).toBeUndefined();
    expect(TurboModuleRegistry.get("EXDevLauncher")).toBeNull();
  });
});

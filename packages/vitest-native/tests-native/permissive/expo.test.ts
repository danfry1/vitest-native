// `nativeModules: 'permissive'` makes every native module present, but the default
// runtime models Expo Go, which has no dev launcher: `EXDevLauncher` is registered only
// by expo-dev-launcher in a development build. expo-constants parses
// `NativeModules.EXDevLauncher.manifestString` when the module is present
// (expo-constants/src/Constants.ts), and expo reads `!!NativeModules.EXDevLauncher` as
// running in a development client (expo/src/Expo.fx.tsx). A present stub made importing
// either throw a JSON parse error.
import { describe, expect, it } from "vitest";
import { NativeModules, TurboModuleRegistry } from "react-native";
import { mockNativeModule } from "vitest-native/helpers";

describe("nativeModules: 'permissive' with the installed Expo", () => {
  it("expo and expo-constants import", async () => {
    const Constants = (await import("expo-constants")).default;
    expect(typeof Constants.executionEnvironment).toBe("string");
    await expect(import("expo")).resolves.toBeDefined();
  });

  it("EXDevLauncher is absent from every lookup, as in Expo Go", () => {
    expect(NativeModules.EXDevLauncher).toBeUndefined();
    expect("EXDevLauncher" in NativeModules).toBe(false);
    expect(TurboModuleRegistry.get("EXDevLauncher")).toBeNull();
    expect(() => TurboModuleRegistry.getEnforcing("EXDevLauncher")).toThrow(
      "TurboModuleRegistry.getEnforcing(...): 'EXDevLauncher' could not be found.",
    );
    const expo = (globalThis as { expo?: { modules: Record<string, unknown> } }).expo;
    expect(expo?.modules.EXDevLauncher).toBeUndefined();
    expect("EXDevLauncher" in expo!.modules).toBe(false);
  });

  it("every other name stays present", () => {
    expect(typeof NativeModules.SomeUnknownModule.anything).toBe("function");
    expect(TurboModuleRegistry.get("SomeUnknownModule")).not.toBeNull();
  });

  it("a test's mockNativeModule('EXDevLauncher') still wins", () => {
    const launcher = { manifestString: "{}" };
    mockNativeModule("EXDevLauncher", launcher);
    expect(NativeModules.EXDevLauncher).toBe(launcher);
    expect("EXDevLauncher" in NativeModules).toBe(true);
    expect(TurboModuleRegistry.get("EXDevLauncher")).toBe(launcher);
    expect(TurboModuleRegistry.getEnforcing("EXDevLauncher")).toBe(launcher);
  });
});

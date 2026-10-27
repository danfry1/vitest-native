// React Native's JS expects a handful of globals to exist at runtime (it reads
// them during module init and rendering). The native setup installs them; without
// them real RN throws on import. These assert the contract the engine provides.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("native engine: React Native runtime globals", () => {
  it("installs __DEV__", () => {
    expect((globalThis as Record<string, unknown>).__DEV__).toBe(true);
  });

  it("installs requestAnimationFrame / cancelAnimationFrame", () => {
    expect(typeof requestAnimationFrame).toBe("function");
    expect(typeof cancelAnimationFrame).toBe("function");
  });

  it("marks the React act + React Native test environment", () => {
    const g = globalThis as Record<string, unknown>;
    expect(g.IS_REACT_ACT_ENVIRONMENT).toBe(true);
    expect(g.IS_REACT_NATIVE_TEST_ENVIRONMENT).toBe(true);
  });

  it("provides the batched-bridge config RN core reads at init", () => {
    expect((globalThis as Record<string, unknown>).__fbBatchedBridgeConfig).toBeDefined();
  });
});

describe("native engine: fabricated expo native-module stubs", () => {
  const modules = (globalThis as Record<string, any>).expo.modules;
  // A module that neither a package mock nor Expo's table describes (nothing probes for
  // it, so it is present), where the stub's conventions apply.
  const PRESENT = "VNWorkspaceModule";

  it("answers a module Expo's table describes as jest-expo does", () => {
    // expo-constants, a devDependency here, defines ExponentConstants.
    expect(modules.ExponentConstants.statusBarHeight).toBe(54);
    expect(modules.ExponentConstants.executionEnvironment).toBe("mock");
    // No `expo` is installed here, so no table is the installed SDK's and a member the
    // table leaves out keeps the stub's conventions. With an SDK's own table it is
    // undefined (the expo and expo-sdk57 consumers).
    expect(modules.ExponentConstants.someConstantItLacks()).toBeUndefined();
  });

  it("keeps a module present unless an installed package only probes for it", () => {
    // Absence needs a probe (expo-image's for ExpoObserve), which nothing installed here
    // makes, so even a name no package defines stays present: reading a module that
    // exists as absent would make requireNativeModule throw. The probe case is covered
    // by the unit tests and the expo-template consumer.
    expect(modules.ExpoObserve).toBeDefined();
    expect(PRESENT in modules).toBe(true);
  });

  it("resolves fabricated *Async methods to a Promise (Expo convention)", async () => {
    await expect(modules[PRESENT].getRegistrationInfoAsync()).resolves.toBeUndefined();
  });

  it("serves fabricated PascalCase properties as classes on SharedObject", () => {
    const NativeClass = modules[PRESENT].FileSystemFile;
    class Sub extends NativeClass {}
    const instance = new Sub();
    expect(instance).toBeInstanceOf((globalThis as Record<string, any>).expo.SharedObject);
    expect(typeof instance.addListener).toBe("function");
    // Memoized: subclass identity must be stable across reads.
    expect(modules[PRESENT].FileSystemFile).toBe(NativeClass);
  });

  it("keeps the no-op fallback for other fabricated methods and explicit overrides winning", () => {
    expect(modules[PRESENT].someMethod()).toBeUndefined();
    modules[PRESENT].getOverriddenAsync = () => "explicit";
    expect(modules[PRESENT].getOverriddenAsync()).toBe("explicit");
  });
});

describe("native engine: ErrorUtils", () => {
  // React Native's error-guard polyfill, installed on device by InitializeCore and
  // read at MODULE SCOPE by Expo's Expo.fx (`ErrorUtils.getGlobalHandler()`), so
  // without it every Expo import under the native engine failed with
  // "ErrorUtils is not defined". The REAL @react-native/js-polyfills implementation
  // is installed, not a lookalike.
  it("installs React Native's real error-guard as global.ErrorUtils", () => {
    const ErrorUtils = (globalThis as Record<string, any>).ErrorUtils;
    expect(ErrorUtils).toBeDefined();
    expect(typeof ErrorUtils.getGlobalHandler).toBe("function");
    expect(typeof ErrorUtils.setGlobalHandler).toBe("function");
    expect(typeof ErrorUtils.applyWithGuard).toBe("function");
    // Round-trips a handler the way Expo.fx does at load.
    const previous = ErrorUtils.getGlobalHandler();
    const handler = () => {};
    ErrorUtils.setGlobalHandler(handler);
    expect(ErrorUtils.getGlobalHandler()).toBe(handler);
    ErrorUtils.setGlobalHandler(previous);
  });
});

describe("native engine: React Native environment setup", () => {
  // `react-native/setup-env` (0.87+) is what InitializeCore delegates to, and Expo
  // SDK 58 requires it directly from its winter runtime. Run for real, its
  // setUpTimers swaps the global setTimeout for RN's JSTimers, which only the native
  // timing module drives, so the first awaited timer never fires and the test file
  // hangs (#296).
  const hasSetupEnv = "./setup-env" in (require("react-native/package.json").exports ?? {});

  it.skipIf(!hasSetupEnv)("does not let react-native/setup-env replace Node's timers", () => {
    const names = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate"];
    const before = names.map((n) => Object.getOwnPropertyDescriptor(globalThis, n));
    let replaced: string[];
    try {
      require("react-native/setup-env");
    } finally {
      // Compare, then put Node's timers back before asserting: with RN's in place,
      // Vitest's own timers stop too and a regression would hang instead of failing.
      replaced = names.filter(
        (n, i) => globalThis[n as keyof typeof globalThis] !== before[i]?.value,
      );
      names.forEach((n, i) => Object.defineProperty(globalThis, n, before[i]!));
    }
    expect(replaced).toEqual([]);
  });
});

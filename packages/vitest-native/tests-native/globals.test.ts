// React Native's JS expects a handful of globals to exist at runtime (it reads
// them during module init and rendering). The native setup installs them; without
// them real RN throws on import. These assert the contract the engine provides.
import { describe, expect, it } from "vitest";

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

  it("resolves fabricated *Async methods to a Promise (Expo convention)", async () => {
    await expect(modules.SomeFabricatedModule.getRegistrationInfoAsync()).resolves.toBeUndefined();
  });

  it("serves fabricated PascalCase properties as classes on SharedObject", () => {
    const NativeClass = modules.SomeFabricatedModule.FileSystemFile;
    class Sub extends NativeClass {}
    const instance = new Sub();
    expect(instance).toBeInstanceOf((globalThis as Record<string, any>).expo.SharedObject);
    expect(typeof instance.addListener).toBe("function");
    // Memoized: subclass identity must be stable across reads.
    expect(modules.SomeFabricatedModule.FileSystemFile).toBe(NativeClass);
  });

  it("keeps the no-op fallback for other fabricated methods and explicit overrides winning", () => {
    expect(modules.SomeFabricatedModule.someMethod()).toBeUndefined();
    modules.SomeFabricatedModule.getOverriddenAsync = () => "explicit";
    expect(modules.SomeFabricatedModule.getOverriddenAsync()).toBe("explicit");
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

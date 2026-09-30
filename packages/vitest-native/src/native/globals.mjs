import { createRequire } from "node:module";
import path from "node:path";
// Globals React Native core expects at runtime, ported from react-native/jest/setup.js.
export function installGlobals() {
  const g = globalThis;
  Object.defineProperties(g, {
    __DEV__: { configurable: true, writable: true, value: true },
    requestAnimationFrame: {
      configurable: true,
      writable: true,
      value: (cb) => setTimeout(() => cb(Date.now()), 0),
    },
    cancelAnimationFrame: {
      configurable: true,
      writable: true,
      value: (id) => clearTimeout(id),
    },
    nativeFabricUIManager: { configurable: true, writable: true, value: {} },
    ...(typeof g.window === "undefined"
      ? { window: { configurable: true, writable: true, value: g } }
      : {}),
  });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.IS_REACT_NATIVE_TEST_ENVIRONMENT = true;
  g.__fbBatchedBridgeConfig = { remoteModuleConfig: [], localModulesConfig: [] };
  g.__vitest_native_module_mocks = g.__vitest_native_module_mocks || Object.create(null);

  installExpoGlobal(g);
}

// expo-modules-core's JS reads its native runtime off `globalThis.expo`
// (`globalThis.expo.EventEmitter`, `.NativeModule`, `.SharedObject`, `.SharedRef`,
// `.modules`, …). The native build installs this; Node has no native runtime, so
// expo-modules-core throws ("Cannot read properties of undefined (reading
// 'EventEmitter')") and every Expo-modules-based library fails to import. Provide a
// JS stub so the real expo-modules-core runs — same approach jest-expo takes.
function installExpoGlobal(g) {
  if (g.expo && g.expo.EventEmitter) return;

  class EventEmitter {
    constructor() {
      this._listeners = new Map();
    }
    addListener(eventName, listener) {
      let set = this._listeners.get(eventName);
      if (!set) this._listeners.set(eventName, (set = new Set()));
      set.add(listener);
      return { remove: () => this.removeListener(eventName, listener) };
    }
    removeListener(eventName, listener) {
      this._listeners.get(eventName)?.delete(listener);
    }
    removeAllListeners(eventName) {
      if (eventName == null) this._listeners.clear();
      else this._listeners.delete(eventName);
    }
    emit(eventName, ...args) {
      this._listeners.get(eventName)?.forEach((l) => l(...args));
    }
    listenerCount(eventName) {
      return this._listeners.get(eventName)?.size ?? 0;
    }
    startObserving() {}
    stopObserving() {}
  }
  // NativeModule / SharedObject / SharedRef extend EventEmitter in expo's runtime.
  class NativeModule extends EventEmitter {}
  class SharedObject extends EventEmitter {}
  class SharedRef extends SharedObject {}

  // `globalThis.expo.modules` is the native-module registry expo libs read via
  // requireNativeModule(). Import-time side effects (e.g. expo-modules-core's
  // setUpJsLogger) call methods like `.addListener` on these, so return a
  // permissive NativeModule stub (EventEmitter methods + no-op for unknown native
  // methods) for any accessed module rather than crashing on `undefined`.
  //
  // Fabricated properties follow two Expo conventions instead of a blanket
  // `() => undefined`:
  // - `*Async` methods return Promises on device, and packages chain on them at
  //   import time (expo-notifications: `getRegistrationInfoAsync().then(...)`),
  //   so they resolve undefined — matching jest-expo's generated mocks.
  // - PascalCase properties are native classes (SharedObjects) that package JS
  //   subclasses (expo-file-system: `class File extends ExpoFileSystem.FileSystemFile`),
  //   so they are memoized classes on SharedObject's prototype chain.
  // Explicitly-set properties (spies, overrides) always win.
  const __moduleCache = new Map();
  const makeModuleStub = () => {
    const fabricatedClasses = new Map();
    return new Proxy(new NativeModule(), {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === "symbol") return undefined;
        if (prop.endsWith("Async")) return () => Promise.resolve(undefined);
        if (/^[A-Z]/.test(prop)) {
          if (!fabricatedClasses.has(prop)) {
            fabricatedClasses.set(prop, class extends SharedObject {});
          }
          return fabricatedClasses.get(prop);
        }
        return () => undefined;
      },
    });
  };
  const modules = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop === "symbol") return undefined;
        if (!__moduleCache.has(prop)) __moduleCache.set(prop, makeModuleStub());
        return __moduleCache.get(prop);
      },
      has: () => true,
    },
  );

  let __uuid = 0;
  g.expo = {
    EventEmitter,
    NativeModule,
    SharedObject,
    SharedRef,
    modules,
    uuidv4: () => {
      __uuid += 1;
      return `00000000-0000-4000-8000-${String(__uuid).padStart(12, "0")}`;
    },
    uuid: {
      v4: () => g.expo.uuidv4(),
      v5: () => g.expo.uuidv4(),
    },
    getViewConfig: () => null,
    reloadAppAsync: () => Promise.resolve(),
  };
}

/**
 * `global.ErrorUtils` — React Native's error-guard polyfill (installed on device by
 * InitializeCore via @react-native/js-polyfills, and by Jest's RN preset as a setup
 * polyfill). The native engine deliberately does not run InitializeCore, and this
 * global was the one piece of it that library code reads at MODULE SCOPE: Expo's
 * `Expo.fx` calls `ErrorUtils.getGlobalHandler()` while loading, so any Expo import
 * under the native engine failed with "ErrorUtils is not defined".
 *
 * The real polyfill is used, not a hand mock: it is Flow-typed, so this must run
 * AFTER the require hooks are installed (they compile it like the rest of the
 * @react-native/* sources), and it is resolved from the project so the version
 * matches the installed React Native. Idempotent per realm. Silent when the
 * polyfill package is absent (a partial install) — nothing else here depends on it.
 */
export function installErrorUtils(projectRoot) {
  const g = globalThis;
  if (g.ErrorUtils) return;
  try {
    const req = createRequire(path.join(projectRoot, "package.json"));
    // Resolved via react-native's own dependency, the way InitializeCore reaches it.
    const rnDir = path.dirname(req.resolve("react-native/package.json"));
    const errorGuard = createRequire(path.join(rnDir, "package.json")).resolve(
      "@react-native/js-polyfills/error-guard",
    );
    req(errorGuard);
  } catch {
    // Not installed; leave the global undefined rather than shipping a lookalike.
  }
}

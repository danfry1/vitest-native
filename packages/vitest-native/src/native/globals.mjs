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
  const __moduleCache = new Map();
  const makeModuleStub = () =>
    new Proxy(new NativeModule(), {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === "symbol") return undefined;
        return () => undefined;
      },
    });
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

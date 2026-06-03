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
}

// The native boundary: the small set of React Native modules that touch native
// code, replaced with mocks. Everything ELSE in RN runs for real. Modules are
// expressed as CJS source strings so both transform hooks (loader + require) can
// serve them identically. Mirrors react-native/jest/setup.js's mock set.

const DEVICE_CONSTANTS = JSON.stringify({
  PlatformConstants: {
    forceTouchAvailable: false,
    reactNativeVersion: { major: 0, minor: 84, patch: 1 },
    osVersion: "17.0",
    systemName: "iOS",
    interfaceIdiom: "phone",
    isTesting: true,
  },
  DeviceInfo: {
    Dimensions: {
      window: { width: 390, height: 844, scale: 3, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
    },
  },
  I18nManager: {
    isRTL: false,
    doLeftAndRightSwapInRTL: true,
    localeIdentifier: "en_US",
  },
});

// A reusable mock-native-component factory, inlined into each source string that needs it.
const MOCK_NATIVE_COMPONENT = `
  const React = require("react");
  let __tag = 1;
  const mockNativeComponent = (viewName) => {
    const C = class extends React.Component {
      constructor(p) { super(p); this._nativeTag = __tag++; }
      render() { return React.createElement(viewName, this.props, this.props.children); }
      blur() {} focus() {} measure() {} measureInWindow() {} measureLayout() {} setNativeProps() {}
    };
    C.displayName = viewName === "RCTView" ? "View" : viewName;
    return C;
  };
`;

const TURBO_STUB = `
  const __C = ${DEVICE_CONSTANTS};
  // Native methods that return a Promise on the device (no callback arg). Without
  // this, real RN code doing \`NativeModule.canOpenURL(url).then(...)\` would crash
  // on \`undefined\`. Values are the no-native defaults.
  const __ASYNC = {
    // Linking
    canOpenURL: false, getInitialURL: null, openURL: undefined, openSettings: undefined,
    sendIntent: undefined, getString: "", getInitialState: null,
    // Share
    share: { action: "dismissedAction", activityType: null },
    // Image loader (getSize resolves to a [width, height] TUPLE — RN destructures it)
    getSize: [0, 0], getSizeWithHeaders: { width: 0, height: 0 },
    prefetchImage: true, prefetchImageWithMetadata: true, queryCache: {},
  };
  // RN callback conventions are inconsistent: most native methods are success-first
  // (e.g. getCurrentVoiceOverState(success, error)), but a few are error-first
  // (e.g. showShareActionSheetWithOptions(options, error, success)). For the latter,
  // the success callback is the LAST function arg.
  const __SUCCESS_LAST = new Set(["showShareActionSheetWithOptions"]);
  const turboStub = (name) => new Proxy({}, {
    get: (_t, p) => {
      if (p === "getConstants") return () => (__C[name] || {});
      if (p === "getColorScheme") return () => "light";        // NativeAppearance
      if (p === "addListener") return () => ({ remove: () => {} });
      if (p === "removeListeners") return () => {};
      return (...args) => {
        // Callback-style native methods resolve via a callback argument. Invoke the
        // success callback so JS Promises that wrap these settle instead of hanging.
        const fns = args.filter((a) => typeof a === "function");
        if (fns.length) {
          const cb = typeof p === "string" && __SUCCESS_LAST.has(p) ? fns[fns.length - 1] : fns[0];
          return cb(false);
        }
        // Promise-returning native methods must yield a Promise, not undefined.
        if (typeof p === "string" && Object.prototype.hasOwnProperty.call(__ASYNC, p)) {
          return Promise.resolve(__ASYNC[p]);
        }
        return undefined;
      };
    },
  });
`;

export const BOUNDARY_SOURCES = {
  "Libraries/TurboModule/TurboModuleRegistry.js": `
    ${TURBO_STUB}
    exports.get = (n) => turboStub(n);
    exports.getEnforcing = (n) => turboStub(n);
  `,
  "Libraries/BatchedBridge/NativeModules.js": `
    ${TURBO_STUB}
    module.exports = { __esModule: true, default: new Proxy({}, {
      get: (_t, n) => (typeof n === "string" ? turboStub(n) : undefined),
    }) };
  `,
  "Libraries/NativeComponent/NativeComponentRegistry.js": `
    ${MOCK_NATIVE_COMPONENT}
    exports.get = (n) => mockNativeComponent(n);
    exports.getWithFallback_DEPRECATED = (n) => mockNativeComponent(n);
    exports.setRuntimeConfigProvider = () => {};
  `,
  "Libraries/ReactNative/requireNativeComponent.js": `
    ${MOCK_NATIVE_COMPONENT}
    module.exports = { __esModule: true, default: (n) => mockNativeComponent(n) };
  `,
  "Libraries/Components/View/ViewNativeComponent.js": `
    ${MOCK_NATIVE_COMPONENT}
    module.exports = { __esModule: true, default: mockNativeComponent("RCTView"), __INTERNAL_VIEW_CONFIG: {}, Commands: {} };
  `,
  "Libraries/Core/InitializeCore.js": `module.exports = { __esModule: true, default: {} };`,
  // RendererProxy re-exports RendererImplementation, which loads RN's native Fabric
  // renderer (ReactNativeRenderer-dev.js) — that version-asserts react vs the bundled
  // react-native-renderer and breaks SectionList/VirtualizedList. react-test-renderer
  // does the real reconciliation, so we only need these imperative helpers as stubs.
  // Mirrors react-native/jest/mocks/RendererProxy.js.
  "Libraries/ReactNative/RendererProxy.js": `
    module.exports = {
      __esModule: true,
      findNodeHandle: () => null,
      findHostInstance_DEPRECATED: () => null,
      dispatchCommand: () => {},
      sendAccessibilityEvent: () => {},
      getNodeFromInternalInstanceHandle: () => null,
      getPublicInstanceFromInternalInstanceHandle: () => null,
      getPublicInstanceFromRootTag: () => null,
      isChildPublicInstance: () => false,
      isProfilingRenderer: () => false,
      renderElement: () => {},
      unmountComponentAtNodeAndRemoveContainer: () => {},
      unstable_batchedUpdates: (fn, a) => fn(a),
    };
  `,
  "Libraries/ReactNative/UIManager.js": `
    module.exports = { __esModule: true, default: new Proxy(
      { getViewManagerConfig: () => ({}), hasViewManagerConfig: () => true, getConstants: () => ({}) },
      { get: (t, p) => (p in t ? t[p] : () => undefined) }
    ) };
  `,
};

const SUFFIXES = Object.keys(BOUNDARY_SOURCES);

/** Normalised-path test: is this a native-boundary module? */
export function isBoundary(normPath) {
  return SUFFIXES.some((s) => normPath.endsWith("/react-native/" + s));
}

/** Returns the CJS source for a boundary module, or null if not a boundary. */
export function boundarySourceFor(normPath) {
  for (const s of SUFFIXES) {
    if (normPath.endsWith("/react-native/" + s)) return BOUNDARY_SOURCES[s];
  }
  return null;
}

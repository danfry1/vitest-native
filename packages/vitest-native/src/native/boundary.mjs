// The native boundary: the small set of React Native modules that touch native
// code, replaced with mocks. Everything ELSE in RN runs for real. Modules are
// expressed as CJS source strings so both transform hooks (loader + require) can
// serve them identically. Mirrors react-native/jest/setup.js's mock set.

function parseVersion(version) {
  const [major = 0, minor = 0, patch = 0] = String(version || "0.0.0")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  return { major, minor, patch };
}

function deviceConstants(platform, reactNativeVersion) {
  const platformConstants =
    platform === "android"
      ? {
          isTesting: true,
          reactNativeVersion,
          Version: 34,
          Release: "14",
          Serial: "unknown",
          Fingerprint: "vitest-native",
          Model: "vitest-native",
          uiMode: "normal",
          Brand: "generic",
          Manufacturer: "generic",
        }
      : {
          forceTouchAvailable: false,
          reactNativeVersion,
          osVersion: "17.0",
          systemName: "iOS",
          interfaceIdiom: "phone",
          isTesting: true,
        };

  return {
    PlatformConstants: platformConstants,
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
    // RN's getDevServer (Libraries/Core/Devtools/getDevServer.js) reads
    // SourceCode.getConstants().scriptURL and calls .match() on it — undefined
    // there throws and takes the whole file down. Expo's async-require
    // (messageSocket) pulls this in on any Expo-core-importing test. Provide a
    // defined string so the lookup resolves instead of crashing.
    //
    // Deliberately a file:// (bundled/release) URL, NOT http(s): getDevServer only
    // treats http(s) scriptURLs as a live server, so a file:// value keeps
    // `bundleLoadedFromServer` false — tests run as if loaded from a bundle, not a
    // Metro dev server. That stops RN internals (AssetSourceResolver,
    // symbolicateStackTrace, DevTools) and third-party SDKs from believing they're
    // connected to a packager and attempting real network I/O against localhost:8081.
    // Mirrors RN's own jest mock, which keeps this flag off (scriptURL: null there,
    // but null would re-introduce the .match crash, so we use a bundled URL).
    SourceCode: {
      scriptURL: "file:///index.bundle",
    },
  };
}

// A reusable mock-native-component factory, inlined into each source string that needs it.
//
// For RCTScrollView we drop the scroll-responder negotiation props that real
// ScrollView attaches to its host (onStartShouldSetResponder &co). On a device
// those drive the native gesture/responder system, which doesn't exist in tests.
// More importantly, RNTL treats any host with onStartShouldSetResponder as a touch
// responder and then gates events on its return value — RN's ScrollView returns
// false, which makes RNTL's fireEvent.scroll a no-op. RN's own jest preset sidesteps
// this by mocking ScrollView so the host never receives these props; we match that
// effect at the host while keeping the real ScrollView component (so FlatList /
// SectionList / VirtualizedList behavior stays intact).
const MOCK_NATIVE_COMPONENT = `
  const React = require("react");
  let __tag = 1;
  const __SCROLL_RESPONDER_PROPS = [
    "onStartShouldSetResponder", "onStartShouldSetResponderCapture",
    "onMoveShouldSetResponder", "onMoveShouldSetResponderCapture",
  ];
  // RN's real TextInput renders its native input host as RCTSinglelineTextInputView /
  // RCTMultilineTextInputView (iOS) or AndroidTextInput. But RNTL's host detection
  // and userEvent (type/clear) + getByPlaceholderText key on the host name "TextInput"
  // — the name jest's RN preset produces by mocking TextInput. Render these native
  // input hosts as "TextInput" so RNTL recognises them, matching the jest preset.
  const __TEXT_INPUT_VIEWS = new Set([
    "RCTSinglelineTextInputView", "RCTMultilineTextInputView", "AndroidTextInput",
    "RCTUITextField", "RCTUITextView",
  ]);
  const mockNativeComponent = (viewName) => {
    const hostName = __TEXT_INPUT_VIEWS.has(viewName) ? "TextInput" : viewName;
    const C = class extends React.Component {
      constructor(p) { super(p); this._nativeTag = __tag++; }
      render() {
        let props = this.props;
        if (viewName === "RCTScrollView") {
          props = Object.assign({}, this.props);
          for (const k of __SCROLL_RESPONDER_PROPS) delete props[k];
        }
        return React.createElement(hostName, props, props.children);
      }
      blur() {} focus() {} measure() {} measureInWindow() {} measureLayout() {} setNativeProps() {}
    };
    C.displayName = viewName === "RCTView" ? "View" : hostName;
    return C;
  };
`;

function turboStubSource(platform, version) {
  const constants = JSON.stringify(deviceConstants(platform, parseVersion(version)));
  return `
  const __C = ${constants};
  const __moduleMocks = () => globalThis.__vitest_native_module_mocks || {};
  const __boundaryState =
    globalThis.__vitest_native_boundary_state ||
    (globalThis.__vitest_native_boundary_state = Object.create(null));
  const getBoundaryState = (name) =>
    __boundaryState[name] || (__boundaryState[name] = Object.create(null));
  const getModuleMock = (name) =>
    Object.prototype.hasOwnProperty.call(__moduleMocks(), name) ? __moduleMocks()[name] : null;
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
  // Stubs are memoized per module name in the shared boundary state, so
  // NativeModules.Foo === NativeModules.Foo === TurboModuleRegistry.get('Foo')
  // (matching bridgeless RN, where NativeModules proxies TurboModuleRegistry).
  // Methods are memoized as own properties of the proxy target on first read —
  // identity-stable across reads, and explicit writes win, so
  // vi.spyOn(NativeModules.Foo, 'method') records calls instead of silently
  // landing on a throwaway object.
  const turboStub = (name) => {
    const state = getBoundaryState(name);
    if (state.__stub) return state.__stub;
    const target = {};
    state.__stub = new Proxy(target, {
      get: (t, p) => {
        // Explicitly-set properties win (spies, manual overrides, memoized methods).
        if (Object.prototype.hasOwnProperty.call(t, p)) return t[p];
        let v;
        if (p === "getConstants") v = () => (__C[name] || {});
        else if (p === "getColorScheme") {
          v = () => getBoundaryState(name).colorScheme ?? "light";
        } else if (p === "setColorScheme") {
          v = (colorScheme) => {
            getBoundaryState(name).colorScheme =
              colorScheme === "unspecified" || colorScheme == null ? "light" : colorScheme;
          };
        } else if (p === "addListener") v = () => ({ remove: () => {} });
        else if (p === "removeListeners") v = () => {};
        else {
          v = (...args) => {
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
        }
        // defineProperty, not assignment: sloppy-mode \`t["__proto__"] = fn\`
        // would invoke the inherited __proto__ SETTER and silently swap the
        // target's prototype instead of memoizing.
        Object.defineProperty(t, p, {
          value: v,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        return v;
      },
      // Every property reads as a callable stub, so report them all as present —
      // vi.spyOn refuses to spy on a property its \`in\` check can't see.
      has: () => true,
    });
    // Hot runtime: clear per-file state (spies, memoized methods) between files
    // via the surgical-reset registry, while keeping the stub's identity for
    // resident libraries that captured a reference at import time. Under the
    // default engine each file gets a fresh process, so this never fires.
    const resets = globalThis.__vitest_native_resets || (globalThis.__vitest_native_resets = []);
    resets.push(() => {
      for (const k of Reflect.ownKeys(target)) delete target[k];
    });
    return state.__stub;
  };
`;
}

export const BOUNDARY_SOURCES = {
  "Libraries/TurboModule/TurboModuleRegistry.js": (platform, version) => `
    ${turboStubSource(platform, version)}
    exports.get = (n) => getModuleMock(n) || turboStub(n);
    exports.getEnforcing = (n) => getModuleMock(n) || turboStub(n);
  `,
  "Libraries/BatchedBridge/NativeModules.js": (platform, version) => `
    ${turboStubSource(platform, version)}
    module.exports = { __esModule: true, default: new Proxy({}, {
      get: (_t, n) => {
        if (typeof n !== "string") return undefined;
        return getModuleMock(n) || turboStub(n);
      },
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
  // TextInput: mirror react-native/jest/setup.js, which replaces the real TextInput
  // with a passthrough host component (jest/mocks/TextInput, via mockComponent).
  // The REAL TextInput's internal _onChange calls onChangeText from the native
  // 'change' event — so running it under RNTL's userEvent.type (which dispatches
  // BOTH 'change' and 'changeText' per keystroke) fires onChangeText TWICE. The
  // passthrough mock puts props (incl. onChangeText) directly on the host, so each
  // event fires its own handler once, matching jest-preset and real single-fire
  // semantics. (Verified by the differential cross-check.)
  "Libraries/Components/TextInput/TextInput.js": `
    const React = require("react");
    class TextInput extends React.Component {
      blur() {} focus() {} clear() {}
      isFocused() { return false; }
      getNativeRef() { return null; }
      measure() {} measureInWindow() {} measureLayout() {} setNativeProps() {}
      render() { return React.createElement("TextInput", this.props, this.props.children); }
    }
    TextInput.displayName = "TextInput";
    // Static API some code touches (TextInput.State.currentlyFocusedInput(), …).
    TextInput.State = {
      currentlyFocusedInput: () => null,
      currentlyFocusedField: () => null,
      focusTextInput: () => {},
      blurTextInput: () => {},
    };
    module.exports = { __esModule: true, default: TextInput };
  `,
  "Libraries/Core/InitializeCore.js": `module.exports = { __esModule: true, default: {} };`,
  // AppContainer (which RNTL's render mounts) renders <LogBoxNotificationContainer/>
  // in dev. That component subscribes to LogBoxData and, in componentDidMount,
  // schedules a setTimeout/ setImmediate setState — which fires AFTER the test's
  // act() completes, producing the cosmetic "update to LogBoxStateSubscription not
  // wrapped in act()" warning. It's dev-only notification UI with no role in tests,
  // so stub it to render nothing. This removes the only mount of LogBoxStateSubscription,
  // eliminating the out-of-act update at its source (jest's RN preset mocks LogBox similarly).
  "Libraries/LogBox/LogBoxNotificationContainer.js": `
    module.exports = { __esModule: true, default: function LogBoxNotificationContainer() { return null; } };
  `,
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

/**
 * Expo modules whose only job is talking to a live dev server — an environment
 * that doesn't exist under Node. `expo`'s Expo.fx requires messageSocket whenever
 * `__DEV__ && globalThis.expo`, and the module throws at load time when the
 * bundle wasn't served over HTTP ("Cannot create devtools websocket connections
 * in embedded environments"), taking down any suite that imports an expo-*
 * package. Stub it to a no-op, like Jest's dev-server layer mocks do. Matched
 * for both the published build/ output and the src/ TS sources (some resolution
 * paths reach src/), in plain and .native platform variants.
 */
const EXPO_DEV_STUBS = {
  "src/async-require/messageSocket.native.ts": "module.exports = {};",
  "src/async-require/messageSocket.ts": "module.exports = {};",
  "build/async-require/messageSocket.native.js": "module.exports = {};",
  "build/async-require/messageSocket.js": "module.exports = {};",
};
const EXPO_SUFFIXES = Object.keys(EXPO_DEV_STUBS);

/** Normalised-path test: is this a native-boundary module? */
export function isBoundary(normPath) {
  return (
    SUFFIXES.some((s) => normPath.endsWith("/react-native/" + s)) ||
    EXPO_SUFFIXES.some((s) => normPath.endsWith("/expo/" + s))
  );
}

/** Returns the CJS source for a boundary module, or null if not a boundary. */
export function boundarySourceFor(normPath, platform = "ios", version = "0.0.0") {
  for (const s of SUFFIXES) {
    if (normPath.endsWith("/react-native/" + s)) {
      const source = BOUNDARY_SOURCES[s];
      return typeof source === "function" ? source(platform, version) : source;
    }
  }
  for (const s of EXPO_SUFFIXES) {
    if (normPath.endsWith("/expo/" + s)) return EXPO_DEV_STUBS[s];
  }
  return null;
}

// Native-engine setup file (injected into test.setupFiles by the plugin). Installs
// globals, registers the ESM loader hook, installs the CJS require hooks, and
// builds any third-party preset mocks the project uses.
import { createRequire, register } from "node:module";
import path from "node:path";
import { expect, vi } from "vitest";
import { installGlobals, installErrorUtils } from "./globals.mjs";
import { installRequireHooks } from "./hooks.mjs";
import { installRegistry } from "./registry.mjs";
import { enableV8CompileCache } from "./compile-cache.mjs";
import * as presetFactories from "../presets.mjs";
import { animatedMatchers } from "../matchers.mjs";
import { serializer as rnSerializer } from "../serializer.mjs";
import { VitestNativeError } from "../errors.mjs";
import { installNitroProxy } from "./nitro.mjs";

// Non-enumerable key on the preset container: the mocks built so far in this file.
const PRESETS_BUILT = Symbol.for("vitest-native.presets-built");

// Hot runtime: the worker resets state left by the PREVIOUS file at the file
// boundary (runner onBeforeCollect), before any setup file — including the user's,
// which Vitest runs ahead of this one. This file only contributes the Vitest-owned
// manifest entry, which needs this module's `vi`. A no-op outside the hot runtime.
if (globalThis.__vitest_native_hot_reset) {
  // Setup re-evaluates per file, but registration is idempotent: the first
  // closure owns the worker-lifetime baseline and the manifest names any
  // restoration failure. Fake timers are the critical case — leaking them into
  // the next file breaks React rendering before an app assertion can explain it.
  globalThis.__vitest_native_register_state?.({
    id: "vitest-runtime",
    // Vitest must uninstall fake timers before descriptor restoration: its
    // uninstall owns Date and deletes it if another entry restores Date first.
    restoreOrder: -200,
    capture: () => null,
    restore: () => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    },
    verify: () => {
      if (vi.isFakeTimers()) {
        throw new VitestNativeError("HOT_STATE_RESTORE_FAILED", "fake timers remain enabled");
      }
    },
  });
  // RNTL's per-file hooks (cleanup, act environment) for a resident RNTL are
  // registered by the worker when a file imports it: see native/rntl-hooks.mjs. Do
  // NOT import or require RNTL here instead — a load from setup in the first file
  // creates the evaluation-order hazard that corrupted rendering (Rocket.Chat).
}

const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
const diagnostics = process.env.VITEST_NATIVE_DIAGNOSTICS === "true";
const platform = process.env.VITEST_NATIVE_PLATFORM === "android" ? "android" : "ios";
const reactNativeVersion = process.env.VITEST_NATIVE_RN_VERSION || "0.0.0";
// Extra node_modules packages to transform (from the plugin's `transform` option).
let transformPkgs = [];
try {
  if (process.env.VITEST_NATIVE_TRANSFORM)
    transformPkgs = JSON.parse(process.env.VITEST_NATIVE_TRANSFORM);
} catch {}
// Asset extensions the Node require-hook should stub (matches the Vite graph).
let assetExts = [];
let sourceExts = ["js", "jsx", "json", "ts", "tsx"];
try {
  if (process.env.VITEST_NATIVE_ASSET_EXTS)
    assetExts = JSON.parse(process.env.VITEST_NATIVE_ASSET_EXTS);
} catch {}
try {
  if (process.env.VITEST_NATIVE_SOURCE_EXTS)
    sourceExts = JSON.parse(process.env.VITEST_NATIVE_SOURCE_EXTS);
} catch {}

// --- Third-party preset mocks ---
//
// Native-runtime libraries (Reanimated's worklets, gesture-handler natives, …)
// cannot execute in Node, so the native engine shadows them with the same
// self-contained mocks the mock engine uses. The plugin resolves which presets
// are active (sync, from installed packages) and passes their names here.
//
// Redirection happens in three places that must agree:
//   1. the Vite plugin's resolveId/load (the app/test graph's direct imports),
//   2. the ESM loader hook (bare imports reaching Node, incl. nested inside
//      externalized third-party libs),
//   3. the CJS require hook (nested require() from externalized libs).
// All three read the mock object from globalThis.__vitest_native_preset_mocks
// (populated below). (2) and (3) close the gap where a third-party library pulls
// in a preset package itself — those requests never reach Vite.
let presetNames = [];
try {
  if (process.env.VITEST_NATIVE_PRESET_NAMES)
    presetNames = JSON.parse(process.env.VITEST_NATIVE_PRESET_NAMES);
} catch {}
// Per-preset config (preset name → JSON config), e.g. navigation route params.
// Presets are rebuilt here from their name, so any factory options come via env.
let presetConfig = {};
try {
  if (process.env.VITEST_NATIVE_PRESET_CONFIG)
    presetConfig = JSON.parse(process.env.VITEST_NATIVE_PRESET_CONFIG);
} catch {}

// Discover preset module (package) names + their static export lists WITHOUT
// building the mocks yet — building can lazily touch react-native, so the require
// hooks must be installed first.
const presetDefs = []; // [{ pkg, mod, presetName }]
const presetExports = {}; // pkg -> string[] (named exports, for the ESM loader)
for (const name of presetNames) {
  const factory = presetFactories[name];
  if (typeof factory !== "function") continue;
  const preset = factory(presetConfig[name]);
  for (const [pkg, mod] of Object.entries(preset.modules)) {
    presetDefs.push({ pkg, mod, presetName: preset.name });
    presetExports[pkg] = mod.exports || [];
  }
}

// Preset-shadowed packages join the Node-side transform set. Their bare and
// subpath imports are redirected to the preset mock before any file loads, so the
// only real files reachable from them are the deliberately exempted pass-throughs
// (package.json subpaths, assets, and Node-safe utility entries such as `mock`,
// `plugin`, `jest-utils`). Some of those ship Metro-only source —
// react-native-worklets' lib/module/mock.js mixes ESM `import` with
// `module.exports`, which served as published throws "module is not defined in
// ES module scope" or, on Node 24 (whose global `module` is the Module
// constructor), loads SILENTLY with empty exports —
// and the preset shadow is exactly what keeps such packages OUT of the detected
// ecosystem list, so nothing else will ever compile them. Membership here only
// makes their files eligible: needsTransform still gates every compile, so a
// pass-through Node can already run is served untouched.
const nodeTransformPkgs = [...new Set([...transformPkgs, ...Object.keys(presetExports)])];

// Enable the V8 compile cache before RN is compiled (it loads when the test file
// imports react-native, after this setup runs) so its bytecode is cached to disk
// and reused on the next file/worker/run. Covers the stock (non-hot) path.
enableV8CompileCache(projectRoot);
installGlobals();
// RNTL 13+ auto-registers matchers through the global expect when imported.
// Expose Vitest's expect only when the consumer has not enabled globals.
if (typeof globalThis.expect === "undefined") {
  Object.defineProperty(globalThis, "expect", {
    configurable: true,
    enumerable: false,
    value: expect,
    writable: true,
  });
}
// register() once per WORKER, not per file: under the hot runtime this setup
// file re-evaluates per test file in a persistent worker, and re-registering
// would stack a new loader-hook layer on every file. (installGlobals and
// installRequireHooks are internally guarded the same way.)
if (!globalThis.__vitest_native_loader_registered) {
  globalThis.__vitest_native_loader_registered = true;
  // Hot ESM generation (see loader.mjs): closes the hot runtime's one measured
  // correctness hole, where a package a test file `import`s keeps its module state
  // for the whole run because Node's ESM registry cannot be invalidated. Only
  // meaningful under the hot runtime — `__vitest_native_hot_reset` is installed by
  // the hot worker before this setup file runs, and nothing bumps the counter
  // otherwise. Shared rather than passed by value because loader hooks run on their
  // own thread. Set VITEST_NATIVE_HOT_ESM_GEN=0 to opt out (and to mutation-test the
  // isolation gate that covers this).
  if (globalThis.__vitest_native_hot_reset && process.env.VITEST_NATIVE_HOT_ESM_GEN !== "0") {
    globalThis.__vitest_native_hot_generation = new Int32Array(new SharedArrayBuffer(4));
    globalThis.__vitest_native_hot_generation[0] = 1;
  }
  register("./loader.mjs", import.meta.url, {
    data: {
      projectRoot,
      platform,
      reactNativeVersion,
      transformPkgs: nodeTransformPkgs,
      presetExports,
      assetExts,
      sourceExts: process.env.VITEST_NATIVE_SOURCE_EXTS ? sourceExts : undefined,
      hotGenerationBuffer: globalThis.__vitest_native_hot_generation?.buffer,
    },
  });
}
// Serve React Native from the precompiled registry when the plugin produced one
// (see registry.mjs). Installed BEFORE the require hooks so their preset-mock
// redirect wraps this one and keeps precedence. Any module the registry cannot
// serve — a computed require, a package in `transform` — falls through to the
// hooks below, so this is purely a faster path to the same modules.
if (process.env.VITEST_NATIVE_RN_REGISTRY) {
  const installed = installRegistry(process.env.VITEST_NATIVE_RN_REGISTRY, projectRoot, sourceExts);
  if (diagnostics) {
    console.log(
      `[vitest-native] (native) precompiled RN registry ${installed ? "installed" : "unavailable; using per-file module loading"}`,
    );
  }
}
// The NitroModules boundary's install() calls this (see nitro.mjs).
globalThis.__vitest_native_install_nitro = () => installNitroProxy(projectRoot);
installRequireHooks(
  projectRoot,
  nodeTransformPkgs,
  platform,
  reactNativeVersion,
  assetExts,
  sourceExts,
);
// After the hooks: the polyfill is Flow-typed and compiled by them (see globals.mjs).
installErrorUtils(projectRoot);

// Preset mocks are built on first use in each file, not up front. A project with
// twenty auto-detected presets otherwise builds ~900 vi.fn() mocks for every test
// file, most of which never import those packages — and Vitest keeps every vi.fn()
// it has ever created (for clearAllMocks), so under worker reuse each file's unused
// mocks stayed reachable for the rest of the run. Accessors are redefined for every
// file, so each file still gets its own fresh mock the moment it needs one.
const g = globalThis;
g.__vitest_native_preset_mocks = g.__vitest_native_preset_mocks || Object.create(null);
const builtPresetMocks = new Map();
Object.defineProperty(g.__vitest_native_preset_mocks, PRESETS_BUILT, {
  configurable: true,
  enumerable: false,
  writable: true,
  value: builtPresetMocks,
});
for (const { pkg, mod, presetName } of presetDefs) {
  Object.defineProperty(g.__vitest_native_preset_mocks, pkg, {
    configurable: true,
    enumerable: true,
    get() {
      if (!builtPresetMocks.has(pkg)) {
        builtPresetMocks.set(pkg, mod.factory());
        if (diagnostics) {
          console.log(`[vitest-native] (native) built preset mock: ${pkg} (${presetName})`);
        }
      }
      return builtPresetMocks.get(pkg);
    },
    set(value) {
      builtPresetMocks.set(pkg, value);
    },
  });
}

// --- Shared test-helper control surface ---
//
// Helpers should manipulate the real RN modules where that is coherent. Platform
// cannot be switched after module resolution: Platform.ios/Platform.android and
// every platform-specific import have already been selected, so setPlatform()
// reports a clear configuration error instead of creating a split-brain graph.
const req = createRequire(path.join(projectRoot, "package.json"));
const RN = req("react-native");
const initialDimensions = {
  window: { ...RN.Dimensions.get("window") },
  screen: { ...RN.Dimensions.get("screen") },
};
const initialColorScheme = RN.Appearance.getColorScheme?.() ?? "light";

function emitColorScheme(colorScheme) {
  RN.Appearance.setColorScheme?.(colorScheme);
  RN.DeviceEventEmitter.emit?.("appearanceChanged", { colorScheme });
}

g.__vitest_native_control = {
  engine: "native",
  setPlatform() {
    throw new VitestNativeError(
      "WRONG_ENGINE_FOR_HELPER",
      `setPlatform() is only available with engine:'mock'. ` +
        `The native engine selects platform files when the module graph loads. ` +
        `Use reactNative({ platform: 'ios' | 'android' }) or separate Vitest projects.`,
    );
  },
  setDimensions(dims) {
    const next = { ...RN.Dimensions.get("window"), ...dims };
    RN.Dimensions.set({ window: next, screen: next });
  },
  setColorScheme(colorScheme) {
    emitColorScheme(colorScheme ?? "light");
  },
  mockNativeModule(name, implementation) {
    g.__vitest_native_module_mocks[name] = implementation;
  },
  resetAllMocks() {
    RN.Dimensions.set({
      window: { ...initialDimensions.window },
      screen: { ...initialDimensions.screen },
    });
    emitColorScheme(initialColorScheme);
    for (const name of Object.keys(g.__vitest_native_module_mocks)) {
      delete g.__vitest_native_module_mocks[name];
    }
    // Only mocks this file actually built; resetting must not build the rest.
    for (const presetMock of builtPresetMocks.values()) {
      presetMock?._reset?.();
      presetMock?._resetStore?.();
    }
    vi.clearAllMocks();
  },
};

// --- RNTL built-in matchers (toBeOnTheScreen, toBeDisabled, toHaveStyle, …) ---
// The mock engine's setup registers these; the native engine must too, or
// `engine:'native'` users have no jest-native/RNTL matchers (and a jest-compat
// migration is worse off — jestCompatAliases no-ops its extend-expect on the
// promise that vitest-native registers them). Caught by the differential cross-check.
try {
  let matchers = null;
  let lastError;
  for (const moduleId of [
    "@testing-library/react-native/matchers",
    "@testing-library/react-native/build/matchers",
    "@testing-library/react-native/dist/matchers",
  ]) {
    try {
      matchers = req(moduleId);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!matchers) throw lastError;
  const fns = {};
  for (const [k, v] of Object.entries(matchers || {})) {
    if (typeof v === "function" && k !== "__esModule") fns[k] = v;
  }
  if (Object.keys(fns).length > 0) {
    expect.extend(fns);
    if (diagnostics) {
      console.log(`[vitest-native] (native) registered ${Object.keys(fns).length} RNTL matchers`);
    }
  }
} catch (e) {
  if (diagnostics) {
    console.log(`[vitest-native] (native) could not load RNTL matchers: ${e?.message}`);
  }
}

// --- RNTL 14: register RCTVirtualText as a text host ---
// RNTL 14 reconciles with `test-renderer`, which enforces that string children
// live under a "text" host component (the names in RNTL's HOST_TEXT_NAMES) and
// otherwise throws "Text strings must be rendered within a <Text> component".
// Real RN renders a NESTED <Text> as the host "RCTVirtualText", which RNTL's list
// (['Text', 'RCTText']) omits — so any composite/nested <Text> crashes under the
// native engine. (Jest's preset never hits this: it mocks Text to a single flat
// "Text" host, hiding the real RCTText/RCTVirtualText split.) Add RCTVirtualText so
// nested text reconciles and getByText matches across nested <Text>, matching how
// RN actually renders. The helper is a leaf module (no RNTL main-module init), so
// requiring it here is free of the evaluation-order hazards noted in the hot-reset
// block. Gated on the list existing: a no-op for RNTL <=13 and the mock engine.
try {
  const hcn = req("@testing-library/react-native/dist/helpers/host-component-names");
  if (Array.isArray(hcn?.HOST_TEXT_NAMES) && !hcn.HOST_TEXT_NAMES.includes("RCTVirtualText")) {
    hcn.HOST_TEXT_NAMES.push("RCTVirtualText");
  }
} catch (e) {
  if (diagnostics) {
    console.log(
      `[vitest-native] (native) could not register RCTVirtualText text host: ${e?.message}`,
    );
  }
}

expect.extend(animatedMatchers);
expect.addSnapshotSerializer(rnSerializer);

// NOTE: the cosmetic React "update to LogBoxStateSubscription not wrapped in
// act()" warning (which used to appear on every interaction) is fixed at the
// source — the native boundary stubs LogBoxNotificationContainer (the dev UI
// AppContainer mounts) to render null, so LogBoxStateSubscription never mounts
// and never schedules its out-of-act setState. See boundary.mjs + the regression
// test tests-native/logbox-act.test.tsx.

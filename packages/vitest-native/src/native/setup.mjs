// Native-engine setup file (injected into test.setupFiles by the plugin). Installs
// globals, registers the ESM loader hook, installs the CJS require hooks, and
// builds any third-party preset mocks the project uses.
import { createRequire, register } from "node:module";
import path from "node:path";
import { expect, vi } from "vitest";
import { installGlobals } from "./globals.mjs";
import { installRequireHooks } from "./hooks.mjs";
import { installRegistry } from "./registry.mjs";
import { enableV8CompileCache } from "./compile-cache.mjs";
import * as presetFactories from "../presets.mjs";
import { animatedMatchers } from "../matchers.mjs";
import { serializer as rnSerializer } from "../serializer.mjs";

// Hot runtime: surgical reset of state left by the PREVIOUS file. Setup files
// are force-inlined by Vitest, so this body re-runs per test file even when the
// rest of this package is externalized — making it the per-file hook. Installed
// by worker.mjs (hot runtime only); a no-op everywhere else.
if (globalThis.__vitest_native_hot_reset) {
  // Vitest-level state first: in a fresh-worker-per-file world these die with
  // the worker, but Vitest's own per-file loop never undoes them. Fake timers
  // are the big one — jest suites enable them per file and rely on teardown;
  // leaked into the next file they break React rendering entirely ("Can't
  // access .root on unmounted test renderer" via RNTL).
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // NOTE on RNTL trees: when RNTL is inlined in the consumer graph it
  // re-evaluates per file (fresh registry + fresh auto-cleanup) and needs no
  // help. When RNTL is externalized/resident, trees from earlier files can
  // stay mounted (auto-cleanup's afterEach only registers in the first file) —
  // a memory accumulation, bounded by worker recycling, NOT a correctness
  // leak (each file renders into fresh roots; cross-file listeners are removed
  // by the reset below). Do NOT "fix" this by importing RNTL here or via Node
  // require — both create instance/evaluation-order hazards that corrupt
  // rendering (found via Rocket.Chat).
  globalThis.__vitest_native_hot_reset();
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
try {
  if (process.env.VITEST_NATIVE_ASSET_EXTS)
    assetExts = JSON.parse(process.env.VITEST_NATIVE_ASSET_EXTS);
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
  register("./loader.mjs", import.meta.url, {
    data: { projectRoot, platform, reactNativeVersion, transformPkgs, presetExports, assetExts },
  });
}
// Serve React Native from the precompiled registry when the plugin produced one
// (see registry.mjs). Installed BEFORE the require hooks so their preset-mock
// redirect wraps this one and keeps precedence. Any module the registry cannot
// serve — a computed require, a package in `transform` — falls through to the
// hooks below, so this is purely a faster path to the same modules.
if (process.env.VITEST_NATIVE_RN_REGISTRY) {
  const installed = installRegistry(process.env.VITEST_NATIVE_RN_REGISTRY, projectRoot);
  if (diagnostics) {
    console.log(
      `[vitest-native] (native) precompiled RN registry ${installed ? "installed" : "unavailable; using per-file module loading"}`,
    );
  }
}
installRequireHooks(projectRoot, transformPkgs, platform, reactNativeVersion, assetExts);

// Build the mock objects now that the require hooks are installed (preset
// factories may lazily resolve react-native at render time).
const g = globalThis;
g.__vitest_native_preset_mocks = g.__vitest_native_preset_mocks || {};
for (const { pkg, mod, presetName } of presetDefs) {
  g.__vitest_native_preset_mocks[pkg] = mod.factory();
  if (diagnostics) {
    console.log(`[vitest-native] (native) registered preset mock: ${pkg} (${presetName})`);
  }
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
    throw new Error(
      `[vitest-native] setPlatform() is only available with engine:'mock'. ` +
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
    for (const presetMock of Object.values(g.__vitest_native_preset_mocks || {})) {
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

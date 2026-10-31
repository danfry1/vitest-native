// Native-engine setup file (injected into test.setupFiles by the plugin). Installs
// globals, registers the ESM loader hook, installs the CJS require hooks, and
// builds any third-party preset mocks the project uses.
import { createRequire, register, registerHooks } from "node:module";
import * as nativeLoader from "./loader.mjs";
import path from "node:path";
import { afterEach, expect, vi } from "vitest";
import { installGlobals, installErrorUtils, installExpoRuntime } from "./globals.mjs";
import { installRequireHooks } from "./hooks.mjs";
import { installRntlJest } from "./rntl-hooks.mjs";
import { installRegistry } from "./registry.mjs";
import { enableV8CompileCache } from "./compile-cache.mjs";
import * as presetFactories from "../presets.mjs";
import { animatedMatchers } from "../matchers.mjs";
import { serializer as rnSerializer } from "../serializer.mjs";
import { VitestNativeError } from "../errors.mjs";
import { CONTEXT_ENV, assertBootContext, requireProjectContext } from "../context.mjs";
import { importPresetModule, presetModulePaths } from "../preset-modules.mjs";
import { installNitroProxy } from "./nitro.mjs";
import { createExpoNativeModuleResolver } from "./expo-native-modules.mjs";
import { cacheRootFor } from "./transform.mjs";
import { installKnownNativeModules } from "./native-modules.mjs";
import { installRntlAutoCleanup } from "../rntl-support.mjs";
import { registerVirtualTextHost } from "./rntl-text-host.mjs";
import { shareProjectModules } from "../jest-compat/node-registry.mjs";

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

const runContext = requireProjectContext();
// Under the hot runtime a worker serves many files, all from the project it booted for.
assertBootContext();
const projectRoot = runContext.projectRoot;
const diagnostics = runContext.diagnostics;
const platform = runContext.platform;
const reactNativeVersion = runContext.reactNativeVersion || "0.0.0";
// Extra node_modules packages to transform (from the plugin's `transform` option).
const transformPkgs = runContext.transform ?? [];
// Asset extensions the Node require hook loads as Metro asset modules (matches the Vite graph).
const assetExts = runContext.assetExts ?? [];
const sourceExts = runContext.sourceExts ?? ["js", "jsx", "json", "ts", "tsx"];

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
const presetNames = runContext.presetNames ?? [];
// Per-preset config (preset name → JSON config), e.g. navigation route params.
// Presets are rebuilt here from their name, so any factory options come via the context.
// Copied: the context is frozen, and a preset factory owns what it is given.
const presetConfig = structuredClone(runContext.presetConfig ?? {});

// Discover preset module (package) names + their export lists WITHOUT building the
// mocks yet — building can lazily touch react-native, so the require hooks must be
// installed first. The plugin read the export lists while resolving its config and
// passes them here, with null for a module whose package is not installed (not
// shadowed). A module with exportsFor (skia) reads its own by parsing the installed
// package with Vite, which this worker must not repeat: it would load Vite into
// every test file's worker.
const providedPresetExports = runContext.presetExports ?? {};
const presetDefs = []; // [{ pkg, mod, presetName }]
const presetExports = {}; // pkg -> string[] (named exports, for the ESM loader)
const presetPreparations = [];
/** Records a preset's shadowed modules, and starts its preparation. */
function adopt(preset) {
  let shadows = false;
  for (const [pkg, mod] of Object.entries(preset.modules)) {
    const provided = providedPresetExports[pkg];
    if (provided === null) continue;
    if (provided === undefined && typeof mod.exportsFor === "function") {
      throw new VitestNativeError(
        "PRESET_UNAVAILABLE",
        `the ${preset.name} preset reads the named exports of '${pkg}' from the ` +
          `installed package, and the plugin passed none for this project. The plugin ` +
          `sets them (the context's presetExports) for each project it configures.`,
      );
    }
    shadows = true;
    presetDefs.push({ pkg, mod, presetName: preset.name });
    presetExports[pkg] = provided ?? mod.exports ?? [];
  }
  if (shadows && typeof preset.prepare === "function") presetPreparations.push(preset.prepare());
}
// vitest-native's presets, rebuilt by name.
for (const name of presetNames) {
  const factory = presetFactories[name];
  if (typeof factory === "function") adopt(factory(presetConfig[name]));
}
// Preset modules of the project's own (presets: ['./path']) are imported once the
// require hooks below exist, so a module that imports react-native at its top level
// loads. The ESM loader takes its export lists before then, from the plugin's.
const presetModuleFiles = presetModulePaths();
if (presetModuleFiles.length > 0) {
  for (const [pkg, names] of Object.entries(providedPresetExports)) {
    if (names !== null && !(pkg in presetExports)) presetExports[pkg] = names;
  }
}
// A preset's async preparation (the skia preset loads CanvasKit) completes before any
// test file imports, so its mock can be built synchronously on first use. The promise
// is published under the same name as the mock engine's (setup.ts).
globalThis.__vitest_native_presets_ready = Promise.all(presetPreparations);
await globalThis.__vitest_native_presets_ready;

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
installGlobals({ projectRoot, platform });
// Before React Native loads: its lookups ask the boundary which modules exist.
installKnownNativeModules(projectRoot);
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
// RNTL registers its afterEach cleanup only through a global afterEach; without
// test.globals, register it here (see rntl-support.mjs). When files share a worker
// (the hot runtime, or `isolate: false`) RNTL stays in Node's module cache across
// files, so the cache cannot say whether this file loaded it: rntl-hooks.mjs and the
// require hook (hooks.mjs) report each load instead.
installRntlAutoCleanup(afterEach, {
  trackImports:
    Boolean(globalThis.__vitest_native_hot_reset) ||
    globalThis.__vitest_worker__?.config?.isolate === false,
});
// register() once per WORKER, not per file: under the hot runtime this setup
// file re-evaluates per test file in a persistent worker, and re-registering
// would stack a new loader-hook layer on every file. (installGlobals and
// installRequireHooks are internally guarded the same way.)
/**
 * Install the ESM loader hooks (loader.mjs).
 *
 * `module.register()` runs hooks on a separate loader thread, so every resolve and load
 * of an externalized module blocks this thread on a synchronous cross-thread request
 * (Node's makeSyncRequest). Profiled on a 105-file production suite, that wait was 18%
 * of all worker CPU time. `module.registerHooks()` (Node 22.15+, 23.5+) runs the same
 * hooks synchronously on this thread instead, so it is used where Node's in-thread hooks
 * are reliable (inThreadHooksReliable in loader.mjs); every other Node keeps
 * `register()`. VITEST_NATIVE_LOADER_THREAD=1 forces the threaded hooks.
 *
 * In-thread hooks also run for `require()`. CommonJS is already handled by the require
 * hooks (hooks.mjs), so those calls go straight to Node's default resolution, as they
 * did when only `import` reached the threaded loader.
 */
function installLoaderHooks(data) {
  if (
    typeof registerHooks !== "function" ||
    process.env.VITEST_NATIVE_LOADER_THREAD === "1" ||
    !nativeLoader.inThreadHooksReliable(process.versions.node)
  ) {
    register("./loader.mjs", import.meta.url, { data });
    globalThis.__vitest_native_loader_mode = "thread";
    return;
  }
  nativeLoader.initialize(data);
  globalThis.__vitest_native_loader_mode = "in-thread";
  const fromRequire = nativeLoader.isRequireContext;
  registerHooks({
    resolve: (specifier, context, nextResolve) =>
      fromRequire(context)
        ? nextResolve(specifier, context)
        : nativeLoader.resolveSync(specifier, context, nextResolve),
    load: (url, context, nextLoad) =>
      fromRequire(context) ? nextLoad(url, context) : nativeLoader.loadSync(url, context, nextLoad),
  });
}

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
  if (
    globalThis.__vitest_native_hot_reset &&
    runContext.hotEsmGeneration !== false &&
    process.env.VITEST_NATIVE_HOT_ESM_GEN !== "0"
  ) {
    globalThis.__vitest_native_hot_generation = new Int32Array(new SharedArrayBuffer(4));
    globalThis.__vitest_native_hot_generation[0] = 1;
  }
  installLoaderHooks({
    projectRoot,
    platform,
    reactNativeVersion,
    transformPkgs: nodeTransformPkgs,
    presetExports,
    assetExts,
    sourceExts: runContext.sourceExts,
    context: process.env[CONTEXT_ENV],
    hotGenerationBuffer: globalThis.__vitest_native_hot_generation?.buffer,
  });
}
// Serve React Native from the precompiled registry when the plugin produced one
// (see registry.mjs). Installed BEFORE the require hooks so their preset-mock
// redirect wraps this one and keeps precedence. Any module the registry cannot
// serve — a computed require, a package in `transform` — falls through to the
// hooks below, so this is purely a faster path to the same modules.
if (runContext.registry) {
  const installed = installRegistry(runContext.registry, projectRoot, sourceExts);
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
// Before any test or user setup file imports RNTL: its fake-timer support reads a
// `jest` of its own (see rntl-hooks.mjs).
installRntlJest(vi);
// Through Vitest, so a TypeScript preset module loads. Its export lists already
// reached the ESM loader from the plugin; a module the plugin did not read would be
// served by the real package there.
for (const file of presetModuleFiles) {
  const preset = await importPresetModule(vi, file);
  const unread = Object.keys(preset.modules).filter((pkg) => !(pkg in providedPresetExports));
  if (unread.length > 0) {
    throw new VitestNativeError(
      "PRESET_UNAVAILABLE",
      `the preset module ${file} shadows ${unread.join(", ")}, which the plugin did not ` +
        `read while resolving its config (the context's presetExports). The plugin reads ` +
        `preset modules once, when the run starts: restart it after changing one.`,
    );
  }
  adopt(preset);
}
// The preset modules' preparations join the built-in presets' (above).
globalThis.__vitest_native_presets_ready = Promise.all(presetPreparations);
await globalThis.__vitest_native_presets_ready;

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
// How each Expo native module answers (expo-native-modules.mjs), read by
// globalThis.expo.modules as a module is first required.
g.__vitest_native_expo_modules = createExpoNativeModuleResolver({
  projectRoot,
  cacheDir: () => cacheRootFor(projectRoot),
  mockFn: (implementation) => vi.fn(implementation),
});
// Before the project's setup files run, as jest-expo does (see globals.mjs).
installExpoRuntime(projectRoot);
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

// --- RNTL: register RCTVirtualText as a text host ---
// Real RN renders a NESTED <Text> as the host "RCTVirtualText", which RNTL's text
// hosts omit. On RNTL 14 that makes a nested <Text> throw "Text strings must be
// rendered within a <Text> component"; on RNTL 12 and 13 the inner text is not a
// text element, so getByText cannot find it. rntl-text-host.mjs explains both and
// patches whichever shape the installed RNTL has (dist/ is 14, build/ is 12 and 13).
//
// Requiring the module here adds no evaluation-order hazard (see the hot-reset
// block): on 13 and 14 it is a leaf, and on 12, where it requires react-native,
// RNTL's config and render-act, the RNTL matchers loaded just above already
// required it and react-native is loaded by now, so this is a cache hit. `req` is
// the project-root require the matchers use, so both patch the same RNTL copy.
try {
  let registered = null;
  let lastError;
  for (const moduleId of [
    "@testing-library/react-native/dist/helpers/host-component-names",
    "@testing-library/react-native/build/helpers/host-component-names",
  ]) {
    let hostComponentNames;
    try {
      hostComponentNames = req(moduleId);
    } catch (error) {
      lastError = error;
      continue;
    }
    registered = registerVirtualTextHost(hostComponentNames);
    if (registered) break;
  }
  if (!registered && diagnostics) {
    const reason =
      lastError?.message ?? "host-component-names has neither HOST_TEXT_NAMES nor isHostText";
    console.log(`[vitest-native] (native) could not register RCTVirtualText text host: ${reason}`);
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

// One instance of a project module per test file: Node's `require` of a project file the
// test already imported gets Vite's instance. Last, after React Native and the setup's
// own loads, so those stay outside what the registry treats as the test's modules.
shareProjectModules();

// NOTE: the cosmetic React "update to LogBoxStateSubscription not wrapped in
// act()" warning (which used to appear on every interaction) is fixed at the
// source — the native boundary stubs LogBoxNotificationContainer (the dev UI
// AppContainer mounts) to render null, so LogBoxStateSubscription never mounts
// and never schedules its out-of-act setState. See boundary.mjs + the regression
// test tests-native/logbox-act.test.tsx.

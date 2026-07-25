// Hot-runtime worker entry for the native engine (loaded by pool.ts's
// NativePoolWorker instead of Vitest's stock dist/workers/threads.js).
//
// The keystone: "schedule like isolate:false, reset like isolate:true."
// The pool runs with isolate:false so the scheduler keeps this worker alive
// across test files — externalized React Native loads once into the thread's
// Node require cache and stays resident. Vitest's own per-file isolation
// (mocker.reset + module-runner resetModules, inside its run() loop) is gated
// on config.isolate, so we flip it back to true here, worker-side, after the
// scheduling decision has already been made. Result: fresh user modules per
// file, hot RN graph.
import { createRequire } from "node:module";
import path from "node:path";
import { isMainThread, parentPort, threadId } from "node:worker_threads";
import { init, runBaseTests, setupEnvironment } from "vitest/worker";
import { installGlobals } from "./globals.mjs";
import { installRequireHooks } from "./hooks.mjs";
import { installHotReset } from "./reset.mjs";
import { installRegistry } from "./registry.mjs";
import { captureModuleBaseline } from "./module-reset.mjs";
import { enableV8CompileCache } from "./compile-cache.mjs";

if (isMainThread || !parentPort) {
  throw new Error("[vitest-native] hot worker entry must run in node:worker_threads");
}

const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
const diagnostics = process.env.VITEST_NATIVE_DIAGNOSTICS === "true";
const platform = process.env.VITEST_NATIVE_PLATFORM === "android" ? "android" : "ios";
const reactNativeVersion = process.env.VITEST_NATIVE_RN_VERSION || "0.0.0";
let transformPkgs = [];
let preserveGlobals = [];
let assetExts = [];
try {
  if (process.env.VITEST_NATIVE_TRANSFORM)
    transformPkgs = JSON.parse(process.env.VITEST_NATIVE_TRANSFORM);
} catch {}
try {
  if (process.env.VITEST_NATIVE_ASSET_EXTS)
    assetExts = JSON.parse(process.env.VITEST_NATIVE_ASSET_EXTS);
} catch {}
try {
  if (process.env.VITEST_NATIVE_HOT_PRESERVE_GLOBALS)
    preserveGlobals = JSON.parse(process.env.VITEST_NATIVE_HOT_PRESERVE_GLOBALS);
} catch {}

if (diagnostics) {
  // One line per worker boot: under a hot pool, N files sharing a worker print
  // this once, not N times — the "RN loads once" proof.
  console.log(`[vitest-native] hot worker boot (pid ${process.pid}, tid ${threadId})`);
}

// --- One-time worker init: load RN into the resident Node require cache ---
// The setup file repeats these installs per file, but they are globalThis-
// guarded; doing them at boot lets RN preload BEFORE the globals baseline and
// listener tracking in reset.mjs, so RN's own boot state is preserved across
// per-file resets rather than wrongly torn down with test pollution.
// Enable the V8 compile cache before any RN module compiles, so the resident
// graph's bytecode is cached to disk for the next worker/run.
enableV8CompileCache(projectRoot);
installGlobals();
// The registry must be installed BEFORE the preload below, not just by the setup
// file: whichever path first resolves react-native decides which instance the
// worker keeps resident, and a preload that bypassed the registry would leave the
// worker holding a second, separate copy of RN's singletons from the one every
// test file sees.
if (process.env.VITEST_NATIVE_RN_REGISTRY) {
  installRegistry(process.env.VITEST_NATIVE_RN_REGISTRY, projectRoot);
}
installRequireHooks(projectRoot, transformPkgs, platform, reactNativeVersion, assetExts);
try {
  const req = createRequire(path.join(projectRoot, "package.json"));
  const RN = req("react-native");
  // RN's index is lazy getters — touch the stateful core modules now so any
  // internal boot-time listeners register before reset.mjs starts tracking.
  for (const name of [
    "DeviceEventEmitter",
    "Dimensions",
    "Platform",
    "AppState",
    "Appearance",
    "Keyboard",
    "Linking",
    "I18nManager",
    "PixelRatio",
    "StyleSheet",
  ]) {
    try {
      void RN[name];
    } catch {}
  }
  // Appearance initializes its bridge listener only when getColorScheme() is
  // first called. Do that before listener tracking starts so the resident RN
  // listener is treated as worker boot state instead of test-file pollution.
  try {
    RN.Appearance.getColorScheme?.();
  } catch {}
} catch (error) {
  throw new Error(
    `[vitest-native] hot worker failed to preload react-native from ${projectRoot}: ${error?.message}`,
    { cause: error },
  );
}
const resetModules = captureModuleBaseline();
const { hotReset, bless } = installHotReset({ projectRoot, diagnostics, preserveGlobals });
globalThis.__vitest_native_hot_reset = () => {
  globalThis.__vitest_native_registry_reset?.();
  const dropped = resetModules();
  hotReset();
  if (diagnostics) console.log(`[vitest-native] hot reset: dropped ${dropped} modules`);
};
globalThis.__vitest_native_hot_bless = bless;

// Vitest's own per-file isolation — mocker reset plus a clear of the evaluated
// module graph — is gated on `config.isolate`, which the pool sets to false so the
// scheduler keeps this worker alive. Doing the two steps ourselves gives the same
// result without touching Vitest's worker state.
//
// This used to be done by mutating `state.ctx.config.isolate = true` inside the
// worker. That read a shape nothing contracts, and it broke on a PATCH release:
// vitest 4.1.9 on Node 24 produced "Cannot read properties of undefined (reading
// 'config')" for every test file and a run that reported no tests at all. The two
// operations below are public API — `mocker.reset()` and Vite's
// `ModuleRunner.clearCache()` — so a Vitest internal moving cannot silently take the
// hot runtime with it.
let moduleRunner = null;

/**
 * Reset the module-runner graph for the next test file.
 *
 * Called from the runner's per-file hook rather than here, because a single task can
 * carry several files (Vitest batches them in single-worker mode) and each one needs
 * its own reset — the same cadence Vitest uses when isolation is on.
 */
// Vitest's own reset deliberately leaves its runtime modules evaluated and only
// clears evaluation state on the rest; it does not throw the module graph away.
// `ModuleRunner.clearCache()` does throw it away, Vitest's own dist included, which
// measured 29% more peak memory and ~6% slower at 200 files — every file re-creating
// module nodes, and re-evaluating Vitest itself, for nothing.
const VITEST_RUNTIME = [/\/vitest\/dist\//, /vitest-virtual-\w+\/dist/, /@vitest\/dist/];

globalThis.__vitest_native_reset_module_runner = () => {
  if (!moduleRunner) return;
  moduleRunner.mocker?.reset();
  for (const [id, node] of moduleRunner.evaluatedModules.idToModuleMap) {
    if (VITEST_RUNTIME.some((re) => re.test(id))) continue;
    node.promise = undefined;
    node.exports = undefined;
    node.evaluated = false;
    node.importers.clear();
  }
};

init({
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads MessagePort, not window
  post: (msg) => parentPort.postMessage(msg),
  on: (callback) => parentPort.on("message", callback),
  off: (callback) => parentPort.off("message", callback),
  teardown: () => parentPort.removeAllListeners("message"),
  runTests: (state, traces) => runBaseTests("run", state, traces),
  collectTests: (state, traces) => runBaseTests("collect", state, traces),
  onModuleRunner: (runner) => {
    moduleRunner = runner;
  },
  setup: setupEnvironment,
});

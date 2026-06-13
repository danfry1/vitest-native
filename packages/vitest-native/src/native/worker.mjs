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

if (isMainThread || !parentPort) {
  throw new Error("[vitest-native] hot worker entry must run in node:worker_threads");
}

const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
const diagnostics = process.env.VITEST_NATIVE_DIAGNOSTICS === "true";
const platform = process.env.VITEST_NATIVE_PLATFORM === "android" ? "android" : "ios";
const reactNativeVersion = process.env.VITEST_NATIVE_RN_VERSION || "0.0.0";
let transformPkgs = [];
let preserveGlobals = [];
try {
  if (process.env.VITEST_NATIVE_TRANSFORM)
    transformPkgs = JSON.parse(process.env.VITEST_NATIVE_TRANSFORM);
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
installGlobals();
installRequireHooks(projectRoot, transformPkgs, platform, reactNativeVersion);
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
const { hotReset, bless } = installHotReset({ projectRoot, diagnostics, preserveGlobals });
globalThis.__vitest_native_hot_reset = hotReset; // invoked by setup.mjs per file
globalThis.__vitest_native_hot_bless = bless; // invoked by runner.mjs after each import phase

function runWithPerFileIsolation(method) {
  return (state, traces) => {
    // Vitest's worker-side per-file reset clears only the module-runner graph;
    // externalized RN in the Node require cache is untouched — exactly the
    // "fresh user modules, resident RN" split the native engine needs.
    state.ctx.config.isolate = true;
    return runBaseTests(method, state, traces);
  };
}

init({
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads MessagePort, not window
  post: (msg) => parentPort.postMessage(msg),
  on: (callback) => parentPort.on("message", callback),
  off: (callback) => parentPort.off("message", callback),
  teardown: () => parentPort.removeAllListeners("message"),
  runTests: runWithPerFileIsolation("run"),
  collectTests: runWithPerFileIsolation("collect"),
  setup: setupEnvironment,
});

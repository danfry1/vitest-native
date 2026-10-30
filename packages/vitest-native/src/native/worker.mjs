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
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, threadId } from "node:worker_threads";
import { init, runBaseTests, setupEnvironment } from "vitest/worker";
import { installGlobals, installErrorUtils } from "./globals.mjs";
import { installKnownNativeModules } from "./native-modules.mjs";
import { installRequireHooks } from "./hooks.mjs";
import { installHotReset } from "./reset.mjs";
import { installRegistry } from "./registry.mjs";
import { captureModuleBaseline, resetEvaluatedModules } from "./module-reset.mjs";
import { registerRntlHooksOnImport } from "./rntl-hooks.mjs";
import { enableV8CompileCache } from "./compile-cache.mjs";
import { VitestNativeError } from "../errors.mjs";
import { markBootContext, requireProjectContext } from "../context.mjs";

if (isMainThread || !parentPort) {
  throw new VitestNativeError("HOT_WORKER_ENV", "hot worker entry must run in node:worker_threads");
}

const context = requireProjectContext();
markBootContext();
const projectRoot = context.projectRoot;
const diagnostics = context.diagnostics;
const platform = context.platform;
const reactNativeVersion = context.reactNativeVersion || "0.0.0";
const transformPkgs = context.transform ?? [];
const preserveGlobals = context.hotPreserveGlobals ?? [];
const assetExts = context.assetExts ?? [];
const sourceExts = context.sourceExts ?? ["js", "jsx", "json", "ts", "tsx"];

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
// graph's bytecode is cached to disk for the next worker/run. Not while hot ESM
// generation is on (the same test setup.mjs makes): every file would add an entry
// per re-evaluated ES module (compile-cache.mjs).
const hotEsmGeneration =
  context.hotEsmGeneration !== false && process.env.VITEST_NATIVE_HOT_ESM_GEN !== "0";
enableV8CompileCache(projectRoot, { skip: hotEsmGeneration });
installGlobals({ projectRoot, platform });
installKnownNativeModules(projectRoot);
// The registry must be installed BEFORE the preload below, not just by the setup
// file: whichever path first resolves react-native decides which instance the
// worker keeps resident, and a preload that bypassed the registry would leave the
// worker holding a second, separate copy of RN's singletons from the one every
// test file sees.
if (context.registry) {
  installRegistry(context.registry, projectRoot, sourceExts);
}
installRequireHooks(
  projectRoot,
  transformPkgs,
  platform,
  reactNativeVersion,
  assetExts,
  sourceExts,
);
// After the hooks: the polyfill is Flow-typed and compiled by them (see globals.mjs).
installErrorUtils(projectRoot);
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
  throw new VitestNativeError(
    "HOT_WORKER_PRELOAD",
    `hot worker failed to preload react-native from ${projectRoot}: ${error?.message}`,
    { cause: error },
  );
}
const resetModules = captureModuleBaseline();
const { hotReset, bless, registerState, stateEntries } = installHotReset({
  projectRoot,
  diagnostics,
  preserveGlobals,
});
globalThis.__vitest_native_register_state = registerState;
globalThis.__vitest_native_state_entries = stateEntries;
globalThis.__vitest_native_hot_reset = () => {
  globalThis.__vitest_native_registry_reset?.();
  // Advance the ESM generation so externalized packages a test file `import`s are
  // re-evaluated instead of served from Node's uninvalidatable ESM registry.
  if (globalThis.__vitest_native_hot_generation) {
    Atomics.add(globalThis.__vitest_native_hot_generation, 0, 1);
  }
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
 * its own reset — the same cadence Vitest uses when isolation is on. See runner.mjs
 * for why that hook is onBeforeCollect and not onCollectStart.
 */
// Vitest's own reset deliberately leaves its runtime modules evaluated and only
// clears evaluation state on the rest; it does not throw the module graph away.
// `ModuleRunner.clearCache()` does throw it away, Vitest's own dist included, which
// measured 29% more peak memory and ~6% slower at 200 files — every file re-creating
// module nodes, and re-evaluating Vitest itself, for nothing. (resetEvaluatedModules,
// in module-reset.mjs, which jest-compat's resetModules shares.)

/**
 * Drop mocks queued but not yet resolved.
 *
 * `vi.mock`/`vi.doMock` push onto a static queue on Vitest's mocker class, which is
 * resolved on the next import. `mocker.reset()` clears the registries but not that
 * queue, so a `vi.doMock` issued after a file's last import was resolved during the
 * NEXT file's first import and mocked it there. Per-file isolation never sees this —
 * the worker, and its queue, go away. The queue is internal (Vitest 4 and 5 both keep
 * it as `static pendingIds` on BareModuleMocker); if it moves, this is a no-op and
 * tests-native/hot-jest-compat fails by name on the runtime-mock surface.
 */
function clearPendingMocks(mocker) {
  for (let C = mocker?.constructor; C && C !== Function.prototype; C = Object.getPrototypeOf(C)) {
    if (Object.hasOwn(C, "pendingIds") && Array.isArray(C.pendingIds)) {
      C.pendingIds = [];
      return;
    }
  }
}

globalThis.__vitest_native_reset_module_runner = () => {
  try {
    // The previous file's realm state (fake timers, stubbed globals, listeners) must be
    // gone before ANY setup file of the next one runs. It used to be reset from this
    // package's setup file, which Vitest runs after the user's own: a user setup that
    // installs fake timers then found the previous file's still installed.
    globalThis.__vitest_native_hot_reset?.();
  } finally {
    // A failed realm restore is reported by the runner as this file's failure; the
    // previous file's modules and mocks are still dropped, so what follows does not
    // inherit them on top of it.
    if (moduleRunner) {
      moduleRunner.mocker?.reset();
      clearPendingMocks(moduleRunner.mocker);
      resetEvaluatedModules(moduleRunner.evaluatedModules);
    }
  }
};

// --- Every scheduled file gets a result ---
//
// Vitest runs a task's files in one loop, and anything that throws out of that loop
// (rather than inside a file's own collection or tests) rejects the whole task. The
// main thread then records one run-level "Test Run Error" and every file of the task
// that had not been collected yet is simply absent: no file entry, no failed test, and
// nothing at all in the JSON reporter, which does not carry run-level errors. In
// single-worker mode a task is the whole suite. The hot runtime adds steps to that loop
// (the per-file reset and bless in runner.mjs), so it owns making that loss loud.
//
// The runner reports each file it hands to the main thread. When a task rejects, the
// files it never reached are run again through Vitest's own path with their import
// replaced by an error that names the cause, so each one is reported as a failed file
// by every reporter. The original error is rethrown too, so the run still fails with
// it. Only our runner reports collection, so a project that replaced it is left alone.
const ownRunner = path.join(path.dirname(fileURLToPath(import.meta.url)), "runner.mjs");
const collected = new Set();
globalThis.__vitest_native_file_collected = (filepath) => collected.add(filepath);

function usesOwnRunner(state) {
  const runner = state.ctx?.config?.runner;
  return typeof runner === "string" && path.resolve(runner) === ownRunner;
}

async function runAccounted(method, state, traces) {
  collected.clear();
  try {
    await runBaseTests(method, state, traces);
  } catch (error) {
    const lost = usesOwnRunner(state)
      ? state.ctx.files.filter((file) => !collected.has(file.filepath))
      : [];
    if (lost.length > 0) await reportLostFiles(method, state, traces, lost, error);
    throw error;
  }
}

async function reportLostFiles(method, state, traces, lost, cause) {
  const reason = cause instanceof Error ? cause.message : String(cause);
  globalThis.__vitest_native_lost_file_error = (filepath) =>
    new VitestNativeError(
      "HOT_FILE_NOT_RUN",
      `hotRuntime: ${filepath} was scheduled on this worker but never ran, because an ` +
        `earlier step of the same task threw outside any test file: ${reason}`,
      { cause },
    );
  try {
    await runBaseTests(
      method,
      { ...state, ctx: { ...state.ctx, files: lost, invalidates: [] } },
      traces,
    );
  } catch {
    // The rethrown original error still fails the run; the message names every file.
  } finally {
    globalThis.__vitest_native_lost_file_error = undefined;
  }
  const missing = lost.filter((file) => !collected.has(file.filepath));
  if (missing.length > 0) {
    throw new VitestNativeError(
      "HOT_FILE_NOT_RUN",
      `hotRuntime: ${missing.length} scheduled test file(s) produced no result: ` +
        `${missing.map((file) => file.filepath).join(", ")}. Cause: ${reason}`,
      { cause },
    );
  }
}

init({
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads MessagePort, not window
  post: (msg) => parentPort.postMessage(msg),
  on: (callback) => parentPort.on("message", callback),
  off: (callback) => parentPort.off("message", callback),
  teardown: () => parentPort.removeAllListeners("message"),
  runTests: (state, traces) => runAccounted("run", state, traces),
  collectTests: (state, traces) => runAccounted("collect", state, traces),
  onModuleRunner: (runner) => {
    moduleRunner = runner;
    registerRntlHooksOnImport(runner.evaluator);
  },
  setup: setupEnvironment,
});

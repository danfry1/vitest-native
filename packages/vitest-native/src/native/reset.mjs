// Surgical per-file reset for the hot runtime (see worker.mjs and runner.mjs).
//
// Vitest's own per-file reset (run with config.isolate flipped on by worker.mjs)
// already re-evaluates everything in the module-runner graph — test files, app
// source, setup files. What it can NOT touch is state living in the worker's
// resident Node require cache: React Native itself (externalized by design),
// other externalized CJS deps, and our boundary mocks. This module covers that
// gap with a boot-baseline + import-attribution model:
//
//   THE ATTRIBUTION PROBLEM: top-level code in an app/test module re-runs for
//   every file and must be cleaned, while a resident externalized dependency
//   initializes only once and may need to retain its process-wide state. A
//   blanket "bless everything created during import" policy confuses the two
//   and leaks app globals, env mutations, and listeners across files.
//
//   The split is observable: runner.mjs calls bless() from onBeforeRunFiles —
//   after the test module (and its resident deps) finished importing, before
//   any test runs. Listener call sites inside node_modules are treated as
//   resident import state; listeners created by app/test modules stay tracked
//   and are removed at the NEXT file's setup. Globals and process.env always
//   return to the worker boot baseline, with an explicit preserveGlobals escape
//   hatch for external libraries that intentionally publish a global registry.
//   If bless() never fires (consumer overrode `runner`), attribution-dependent
//   teardowns stay disarmed — fail-open rather than guessing.
//
// Covered surfaces:
//   1. RN event listeners — every NativeEventEmitter (AppState, Appearance,
//      Keyboard, …) delegates to the RCTDeviceEventEmitter singleton, so one
//      wrapped addListener tracks the whole RN JS event surface. Test-phase
//      subscriptions are removed via their own public subscription.remove().
//      Only import-phase subscriptions owned by node_modules are blessed.
//   2. RN module state with known mutation APIs (Dimensions.set) — restored
//      from a boot-time snapshot (value-restore: no attribution needed).
//   2b. process.env — restored to the worker boot snapshot.
//   3. Vitest timers/global/env stubs — restored by setup.mjs before this reset.
//   4. Boundary/preset mocks that registered callbacks in
//      globalThis.__vitest_native_resets (none are stateful today; the
//      registry is the extension point).
//   5. globalThis keys added by a file — deleted. The baseline starts at the
//      first per-file call (after Vitest injected its per-batch globals) and
//      never grows implicitly. Mutations of pre-existing keys are not restored
//      (documented limitation).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keys owned by the harness or this plugin — never deleted by the globals diff.
const HARNESS_GLOBALS = /^(__vitest_native_|__VITEST|__coverage__|__VITE)/;
// Vitest updates these scheduler-owned values between tasks.
const ENV_PRESERVED = new Set(["VITEST_POOL_ID", "VITEST_WORKER_ID"]);
const RESET_FILE = fileURLToPath(import.meta.url).replaceAll("\\", "/");
const DEFAULT_PRESERVED_GLOBALS = ["__STORYBOOK_ADDONS_PREVIEW"];

function isResidentImportListener(stack, projectRoot) {
  const root = projectRoot.replaceAll("\\", "/").replace(/\/$/, "");
  let sawExternalFrame = false;

  for (const rawLine of stack.split("\n").slice(1)) {
    const line = rawLine.replaceAll("\\", "/");
    if (line.includes(RESET_FILE)) continue;
    if (!line.includes(`${root}/`)) continue;
    if (line.includes("/node_modules/")) {
      sawExternalFrame = true;
      continue;
    }
    // A project-owned frame means this listener was created by app/test code,
    // even when the call passed through React Native internals.
    return false;
  }

  return sawExternalFrame;
}

/**
 * Called once at hot-worker boot, AFTER react-native has been preloaded and its
 * stateful core modules touched (so their internal boot-time listeners register
 * before the tracking wrapper installs). Returns { hotReset, bless }:
 * hotReset is invoked by setup.mjs at the top of every file; bless by
 * runner.mjs between a file's import phase and its first test.
 */
export function installHotReset({ projectRoot, diagnostics, preserveGlobals = [] }) {
  const req = createRequire(path.join(projectRoot, "package.json"));
  const RN = req("react-native");
  const explicitlyPreserved = new Set([...DEFAULT_PRESERVED_GLOBALS, ...preserveGlobals]);

  // --- (1) Track listeners added to the RCTDeviceEventEmitter singleton ---
  const tracked = new Map();
  const emitter = RN.DeviceEventEmitter;
  const origAddListener = emitter.addListener.bind(emitter);
  emitter.addListener = (type, listener, context) => {
    const sub = origAddListener(type, listener, context);
    tracked.set(sub, {
      residentImport: isResidentImportListener(new Error().stack || "", projectRoot),
    });
    return sub;
  };

  // --- (2) Boot snapshot of mutable resident RN state ---
  let dims = null;
  try {
    dims = {
      window: { ...RN.Dimensions.get("window") },
      screen: { ...RN.Dimensions.get("screen") },
    };
  } catch {}

  // --- (2b) Fixed process.env worker-boot snapshot ---
  const envBaseline = { ...process.env };

  // --- (5) globalThis baseline: starts at the first per-file call and remains
  // fixed. Explicitly preserved keys may join it at an import boundary. ---
  let globalBaseline = null;

  // Attribution-dependent teardowns run only once bless() has fired at least
  // once (i.e. the hot runner is installed and working).
  let armed = false;

  function bless() {
    armed = true;
    if (globalBaseline) {
      for (const key of explicitlyPreserved) {
        if (Object.hasOwn(globalThis, key)) globalBaseline.add(key);
      }
    }
    // Resident external dependencies do not re-run, so retain only listeners
    // whose import-time call stack belongs exclusively to node_modules.
    for (const [sub, record] of tracked) {
      if (record.residentImport) tracked.delete(sub);
    }
  }

  function hotReset() {
    if (globalBaseline === null) {
      // First file: nothing to clean — the worker is pristine. Capture the
      // baseline every later file must be reset back to.
      globalBaseline = new Set(Reflect.ownKeys(globalThis));
      return;
    }

    // (3) RNTL cleanup happens in setup.mjs, NOT here: it must run in the
    // module-runner context so it reaches the SAME RNTL instance the tests
    // use. Loading RNTL through Node from here created a second instance whose
    // act/auto-cleanup machinery corrupted rendering for every later file
    // when the consumer's graph inlines RNTL (found via Rocket.Chat).

    // (2) Restore mutable resident RN state (value-restore, always safe).
    if (dims) {
      try {
        RN.Dimensions.set(dims);
      } catch {}
    }

    // (4) Boundary/preset mock reset callbacks.
    const resets = globalThis.__vitest_native_resets;
    if (Array.isArray(resets)) {
      for (const fn of resets) {
        try {
          fn();
        } catch {}
      }
    }

    if (!armed) return; // no bless yet → cannot attribute; fail open

    // (1) Remove the previous file's test-phase RN event listeners.
    for (const sub of tracked.keys()) {
      try {
        sub.remove();
      } catch {}
    }
    tracked.clear();

    // (2b) Restore process.env to the worker boot snapshot.
    for (const key of Object.keys(process.env)) {
      if (ENV_PRESERVED.has(key)) continue;
      if (!(key in envBaseline)) delete process.env[key];
      else if (process.env[key] !== envBaseline[key]) process.env[key] = envBaseline[key];
    }
    for (const key of Object.keys(envBaseline)) {
      if (!(key in process.env) && !ENV_PRESERVED.has(key)) process.env[key] = envBaseline[key];
    }

    // (5) Delete globals added during the previous test phase.
    const deleted = [];
    for (const key of Reflect.ownKeys(globalThis)) {
      if (globalBaseline.has(key)) continue;
      if (typeof key === "string" && HARNESS_GLOBALS.test(key)) continue;
      try {
        delete globalThis[key];
        if (diagnostics) deleted.push(String(key));
      } catch {}
    }
    if (diagnostics && deleted.length) {
      console.log(`[vitest-native] hot reset: deleted test-phase globals: ${deleted.join(", ")}`);
    }
  }

  return { hotReset, bless };
}

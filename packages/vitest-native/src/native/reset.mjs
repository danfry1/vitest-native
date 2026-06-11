// Surgical per-file reset for the hot runtime (see worker.mjs and runner.mjs).
//
// Vitest's own per-file reset (run with config.isolate flipped on by worker.mjs)
// already re-evaluates everything in the module-runner graph — test files, app
// source, setup files. What it can NOT touch is state living in the worker's
// resident Node require cache: React Native itself (externalized by design),
// other externalized CJS deps, and our boundary mocks. This module covers that
// gap with an import-phase/test-phase attribution model:
//
//   THE ATTRIBUTION PROBLEM: a resident (externalized) library that lazily
//   initializes during a file's IMPORT phase creates globals/listeners exactly
//   once — tear those down and the library breaks for every later file, because
//   its module init never re-runs (found the hard way: deleting Storybook's
//   __STORYBOOK_ADDONS_PREVIEW registry made every later story render empty).
//   State created during the TEST phase, by contrast, is pollution to remove.
//
//   The split is observable: runner.mjs calls bless() from onBeforeRunFiles —
//   after the test module (and its resident deps) finished importing, before
//   any test runs. Everything present at bless() joins the baseline; everything
//   that appears after it is test-phase pollution, reset by hotReset() at the
//   NEXT file's setup. If bless() never fires (consumer overrode `runner`), the
//   attribution-dependent teardowns stay disarmed — fail-open to stock
//   isolate:false semantics rather than guessing.
//
// Covered surfaces:
//   1. RN event listeners — every NativeEventEmitter (AppState, Appearance,
//      Keyboard, …) delegates to the RCTDeviceEventEmitter singleton, so one
//      wrapped addListener tracks the whole RN JS event surface. Test-phase
//      subscriptions are removed via their own public subscription.remove();
//      import-phase subscriptions are blessed.
//   2. RN module state with known mutation APIs (Dimensions.set) — restored
//      from a boot-time snapshot (value-restore: no attribution needed).
//   2b. process.env — restored to the last bless() snapshot.
//   3. RNTL trees left mounted — RNTL is resident too, so its auto-cleanup
//      afterEach (registered during the first file) never re-registers for
//      later files; cleanup() is called explicitly.
//   4. Boundary/preset mocks that registered callbacks in
//      globalThis.__vitest_native_resets (none are stateful today; the
//      registry is the extension point).
//   5. globalThis keys added during the previous TEST phase — deleted. The
//      baseline starts at the first per-file call (after Vitest injected its
//      per-batch globals) and grows at every bless(). Mutations of
//      pre-existing keys are not restored (documented v1 limitation).
import { createRequire } from "node:module";
import path from "node:path";

// Keys owned by the harness or this plugin — never deleted by the globals diff.
const PRESERVED_GLOBALS = /^(__vitest|__VITEST|__coverage__|__VITE)/;
// Vitest-managed env keys change per task; leave them alone.
const ENV_PRESERVED = /^VITEST_/;

/**
 * Called once at hot-worker boot, AFTER react-native has been preloaded and its
 * stateful core modules touched (so their internal boot-time listeners register
 * before the tracking wrapper installs). Returns { hotReset, bless }:
 * hotReset is invoked by setup.mjs at the top of every file; bless by
 * runner.mjs between a file's import phase and its first test.
 */
export function installHotReset({ projectRoot, diagnostics }) {
  const req = createRequire(path.join(projectRoot, "package.json"));
  const RN = req("react-native");

  // --- (1) Track listeners added to the RCTDeviceEventEmitter singleton ---
  const tracked = new Set();
  const emitter = RN.DeviceEventEmitter;
  const origAddListener = emitter.addListener.bind(emitter);
  emitter.addListener = (type, listener, context) => {
    const sub = origAddListener(type, listener, context);
    tracked.add(sub);
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

  // --- (2b) process.env snapshot, refreshed at every bless() ---
  let envBaseline = { ...process.env };

  // --- (5) globalThis baseline: starts at the first per-file call, grows at
  // every bless() ---
  let globalBaseline = null;

  // Attribution-dependent teardowns run only once bless() has fired at least
  // once (i.e. the hot runner is installed and working).
  let armed = false;

  function bless() {
    armed = true;
    if (globalBaseline) {
      for (const key of Reflect.ownKeys(globalThis)) globalBaseline.add(key);
    }
    envBaseline = { ...process.env };
    // Import-phase subscriptions are legitimate resident state — stop tracking.
    tracked.clear();
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
    for (const sub of tracked) {
      try {
        sub.remove();
      } catch {}
    }
    tracked.clear();

    // (2b) Restore process.env to the last bless() snapshot.
    for (const key of Object.keys(process.env)) {
      if (ENV_PRESERVED.test(key)) continue;
      if (!(key in envBaseline)) delete process.env[key];
      else if (process.env[key] !== envBaseline[key]) process.env[key] = envBaseline[key];
    }
    for (const key of Object.keys(envBaseline)) {
      if (!(key in process.env) && !ENV_PRESERVED.test(key)) process.env[key] = envBaseline[key];
    }

    // (5) Delete globals added during the previous test phase.
    const deleted = [];
    for (const key of Reflect.ownKeys(globalThis)) {
      if (globalBaseline.has(key)) continue;
      if (typeof key === "string" && PRESERVED_GLOBALS.test(key)) continue;
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

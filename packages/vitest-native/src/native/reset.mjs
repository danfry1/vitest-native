// Shared-realm restoration for the hot runtime. Vitest resets the Vite graph;
// this manifest covers Node/RN state, environment, listeners, descriptors,
// timers, native-boundary mocks, ErrorUtils and Expo state. runner.mjs calls
// bless() after import and before tests. Only imports whose shared ownership
// policy is worker-resident keep their listener state; ordinary dependencies and
// app/test code re-evaluate and remain resettable. Attribution-dependent cleanup
// stays disarmed if a consumer replaces the runner, rather than guessing.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VitestNativeError } from "../errors.mjs";
import { isRuntimeResidentFile, isTestRuntimeResidentFile } from "./ownership.mjs";
import { createStateManifest } from "./state-manifest.mjs";

// Keys owned by the harness or this plugin — never deleted by the globals diff.
const HARNESS_GLOBALS = /^(__vitest_native_|__VITEST|__coverage__|__VITE)/;
// Node's bundled undici installs these non-configurable symbols lazily. Their
// lifecycle belongs to the host runtime, not to the test file that happens to
// trigger initialization, and attempting to delete them poisons every later
// file. Keep the allowlist narrow and description-based across Node releases.
const NODE_LAZY_GLOBAL_SYMBOLS = /^undici\.(?:globalDispatcher|globalOrigin)(?:\.|$)/;
// Vitest updates these scheduler-owned values between tasks.
const ENV_PRESERVED = new Set(["VITEST_POOL_ID", "VITEST_WORKER_ID"]);
const RESET_FILE = fileURLToPath(import.meta.url).replaceAll("\\", "/");
const DEFAULT_PRESERVED_GLOBALS = ["__STORYBOOK_ADDONS_PREVIEW"];

function stateFailure(message) {
  return new VitestNativeError("HOT_STATE_RESTORE_FAILED", message);
}

export function isResidentImportListener(stack, projectRoot) {
  const root = projectRoot.replaceAll("\\", "/").replace(/\/$/, "");
  let sawExternalFrame = false;

  for (const rawLine of stack.split("\n").slice(1)) {
    const line = rawLine.replaceAll("\\", "/");
    if (line.includes(RESET_FILE)) continue;
    if (line.includes("/node_modules/")) {
      sawExternalFrame = true;
      // Most Node-owned packages reset per file. Only the identity-sensitive
      // runtime/test-runtime allowlists are truly resident; blessing every
      // node_modules frame duplicates listeners when an ordinary dependency
      // re-evaluates in the next file. This is the same reset policy used by
      // module-reset.mjs, not a second location heuristic.
      if (!isRuntimeResidentFile(line) && !isTestRuntimeResidentFile(line)) return false;
      continue;
    }
    if (!line.includes(`${root}/`)) continue;
    // A project-owned frame means this listener was created by app/test code,
    // even when the call passed through React Native internals.
    return false;
  }

  return sawExternalFrame;
}

function captureDescriptors(target) {
  return new Map(
    Reflect.ownKeys(target).map((key) => [key, Object.getOwnPropertyDescriptor(target, key)]),
  );
}

function sameDescriptor(left, right) {
  if (!left || !right) return left === right;
  return (
    left.configurable === right.configurable &&
    left.enumerable === right.enumerable &&
    left.writable === right.writable &&
    Object.is(left.value, right.value) &&
    left.get === right.get &&
    left.set === right.set
  );
}

function restoreDescriptors(target, baseline, skip = () => false) {
  for (const key of Reflect.ownKeys(target)) {
    if (skip(key) || baseline.has(key)) continue;
    if (!Reflect.deleteProperty(target, key)) {
      throw stateFailure(`could not delete ${String(key)}`);
    }
  }
  for (const [key, descriptor] of baseline) {
    if (skip(key)) continue;
    if (!sameDescriptor(Object.getOwnPropertyDescriptor(target, key), descriptor)) {
      Object.defineProperty(target, key, descriptor);
    }
  }
}

function verifyDescriptors(target, baseline, skip = () => false) {
  for (const key of Reflect.ownKeys(target)) {
    if (!skip(key) && !baseline.has(key)) throw stateFailure(`unexpected ${String(key)}`);
  }
  for (const [key, descriptor] of baseline) {
    if (skip(key)) continue;
    if (!sameDescriptor(Object.getOwnPropertyDescriptor(target, key), descriptor)) {
      throw stateFailure(`descriptor differs for ${String(key)}`);
    }
  }
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
  const globallyPreserved = new Set();
  const manifest = createStateManifest({
    diagnostics,
    mutation: process.env.VITEST_NATIVE_HOT_STATE_MUTATION || null,
  });

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

  // Track process listeners with the same attribution rule. Node's once() and
  // prependOnceListener() delegate through these methods, so their wrapper listener
  // is captured without replacing EventEmitter's once semantics.
  const trackedProcessListeners = new Set();
  const originalProcessAdd = process.addListener;
  const originalProcessPrepend = process.prependListener;
  const originalProcessRemove = process.removeListener;
  function trackProcessAdd(original) {
    return function (eventName, listener) {
      const before = process.rawListeners(eventName);
      const result = original.call(this, eventName, listener);
      const after = process.rawListeners(eventName);
      const remaining = [...before];
      const added = after.filter((candidate) => {
        const index = remaining.indexOf(candidate);
        if (index === -1) return true;
        remaining.splice(index, 1);
        return false;
      });
      for (const rawListener of added) {
        trackedProcessListeners.add({
          eventName,
          rawListener,
          residentImport: isResidentImportListener(new Error().stack || "", projectRoot),
        });
      }
      return result;
    };
  }
  const trackedAdd = trackProcessAdd(originalProcessAdd);
  process.addListener = trackedAdd;
  process.on = trackedAdd;
  process.prependListener = trackProcessAdd(originalProcessPrepend);

  // Attribution-dependent teardowns run only once bless() has fired at least
  // once (i.e. the hot runner is installed and working).
  let armed = false;

  function bless() {
    armed = true;
    for (const key of explicitlyPreserved) {
      if (Object.hasOwn(globalThis, key)) globallyPreserved.add(key);
    }
    // Resident external dependencies do not re-run, so retain only listeners
    // whose import-time call stack belongs exclusively to packages the shared
    // ownership policy marks worker-resident.
    for (const [sub, record] of tracked) {
      if (record.residentImport) tracked.delete(sub);
    }
    for (const record of trackedProcessListeners) {
      if (record.residentImport) trackedProcessListeners.delete(record);
    }
    globalThis.expo?.[Symbol.for("vitest-native.expo.reset")]?.bless?.((stack) =>
      isResidentImportListener(stack, projectRoot),
    );
  }

  manifest.register({
    id: "native-boundary-mocks",
    // Clear per-file boundary overrides before value-based RN restores route
    // through those same boundary objects.
    restoreOrder: -100,
    capture: () => null,
    restore: () => {
      const resets = globalThis.__vitest_native_resets;
      if (Array.isArray(resets)) for (const reset of resets) reset();
    },
    verify: () => {
      const resets = globalThis.__vitest_native_resets;
      if (Array.isArray(resets) && resets.some((reset) => reset.verify?.() === false)) {
        throw stateFailure("native boundary overrides remain");
      }
    },
  });

  // mockNativeModule() registrations. A registered module EXISTS for NativeModules
  // and TurboModuleRegistry.get() (native/boundary.mjs), so one a file never reset
  // would make the next file's feature detection see a module no app registers.
  const moduleMocks = () => globalThis.__vitest_native_module_mocks;
  manifest.register({
    id: "native-module-mocks",
    capture: () => ({ ...moduleMocks() }),
    restore: (snapshot) => {
      const registry = moduleMocks();
      if (!registry) return;
      for (const name of Object.keys(registry)) {
        if (!Object.hasOwn(snapshot, name)) delete registry[name];
      }
      for (const [name, implementation] of Object.entries(snapshot)) {
        registry[name] = implementation;
      }
    },
    verify: (snapshot) => {
      const current = moduleMocks() ?? {};
      const names = Object.keys(current);
      if (
        names.length !== Object.keys(snapshot).length ||
        names.some((name) => !Object.hasOwn(snapshot, name) || current[name] !== snapshot[name])
      ) {
        throw stateFailure("mockNativeModule() registrations differ from the worker baseline");
      }
    },
  });

  manifest.register({
    id: "react-native.dimensions",
    capture: () => ({
      window: { ...RN.Dimensions.get("window") },
      screen: { ...RN.Dimensions.get("screen") },
    }),
    restore: (snapshot) => RN.Dimensions.set(snapshot),
    verify: (snapshot) => {
      const current = {
        window: RN.Dimensions.get("window"),
        screen: RN.Dimensions.get("screen"),
      };
      if (JSON.stringify(current) !== JSON.stringify(snapshot)) {
        throw stateFailure("Dimensions differ from the worker baseline");
      }
    },
  });

  manifest.register({
    id: "react-native.appearance",
    capture: () => RN.Appearance.getColorScheme?.() ?? null,
    restore: (snapshot) => RN.Appearance.setColorScheme?.(snapshot),
    verify: (snapshot) => {
      if ((RN.Appearance.getColorScheme?.() ?? null) !== snapshot) {
        throw stateFailure("Appearance differs from the worker baseline");
      }
    },
  });

  manifest.register({
    id: "react-native.event-listeners",
    capture: () => null,
    restore: () => {
      if (!armed) return;
      for (const sub of tracked.keys()) sub.remove();
      tracked.clear();
    },
    verify: () => {
      if (armed && tracked.size > 0) {
        throw stateFailure(`${tracked.size} subscriptions remain`);
      }
    },
  });

  manifest.register({
    id: "process.env",
    capture: () => ({ ...process.env }),
    restore: (baseline) => {
      for (const key of Object.keys(process.env)) {
        if (ENV_PRESERVED.has(key)) continue;
        if (!(key in baseline)) delete process.env[key];
        else if (process.env[key] !== baseline[key]) process.env[key] = baseline[key];
      }
      for (const key of Object.keys(baseline)) {
        if (!(key in process.env) && !ENV_PRESERVED.has(key)) process.env[key] = baseline[key];
      }
    },
    verify: (baseline) => {
      const keys = new Set([...Object.keys(process.env), ...Object.keys(baseline)]);
      for (const key of keys) {
        if (!ENV_PRESERVED.has(key) && process.env[key] !== baseline[key]) {
          throw stateFailure(`${key} differs from the worker baseline`);
        }
      }
    },
  });

  manifest.register({
    id: "process.listeners",
    capture: () => ({
      addListener: process.addListener,
      on: process.on,
      prependListener: process.prependListener,
    }),
    restore: (baseline) => {
      if (armed) {
        for (const record of trackedProcessListeners) {
          originalProcessRemove.call(process, record.eventName, record.rawListener);
        }
        trackedProcessListeners.clear();
      }
      process.addListener = baseline.addListener;
      process.on = baseline.on;
      process.prependListener = baseline.prependListener;
    },
    verify: (baseline) => {
      if (armed && trackedProcessListeners.size > 0) {
        throw stateFailure(`${trackedProcessListeners.size} listeners remain`);
      }
      if (
        process.addListener !== baseline.addListener ||
        process.on !== baseline.on ||
        process.prependListener !== baseline.prependListener
      ) {
        throw stateFailure("process listener methods differ from the worker baseline");
      }
    },
  });

  manifest.register({
    id: "global.descriptors",
    capture: () => captureDescriptors(globalThis),
    restore: (baseline) => {
      const deleted = [];
      const skip = (key) =>
        globallyPreserved.has(key) ||
        (typeof key === "string" && HARNESS_GLOBALS.test(key)) ||
        (typeof key === "symbol" &&
          !baseline.has(key) &&
          NODE_LAZY_GLOBAL_SYMBOLS.test(key.description ?? ""));
      if (diagnostics) {
        for (const key of Reflect.ownKeys(globalThis)) {
          if (!skip(key) && !baseline.has(key)) deleted.push(String(key));
        }
      }
      restoreDescriptors(globalThis, baseline, skip);
      if (diagnostics && deleted.length) {
        console.log(`[vitest-native] hot reset: deleted test-phase globals: ${deleted.join(", ")}`);
      }
    },
    verify: (baseline) =>
      verifyDescriptors(
        globalThis,
        baseline,
        (key) =>
          globallyPreserved.has(key) ||
          (typeof key === "string" && HARNESS_GLOBALS.test(key)) ||
          (typeof key === "symbol" &&
            !baseline.has(key) &&
            NODE_LAZY_GLOBAL_SYMBOLS.test(key.description ?? "")),
      ),
  });

  manifest.register({
    id: "console.descriptors",
    capture: () => captureDescriptors(console),
    restore: (baseline) => restoreDescriptors(console, baseline),
    verify: (baseline) => verifyDescriptors(console, baseline),
  });

  manifest.register({
    id: "react-native.error-utils",
    capture: () => globalThis.ErrorUtils?.getGlobalHandler?.(),
    restore: (baseline) => {
      if (baseline) globalThis.ErrorUtils?.setGlobalHandler?.(baseline);
    },
    verify: (baseline) => {
      if (baseline && globalThis.ErrorUtils?.getGlobalHandler?.() !== baseline) {
        throw stateFailure("ErrorUtils handler differs from the worker baseline");
      }
    },
  });

  manifest.register({
    id: "expo.runtime",
    capture: () => captureDescriptors(globalThis.expo ?? {}),
    restore: (baseline) => {
      globalThis.expo?.[Symbol.for("vitest-native.expo.reset")]?.();
      if (globalThis.expo) restoreDescriptors(globalThis.expo, baseline);
    },
    verify: (baseline) => {
      if (globalThis.expo) {
        verifyDescriptors(globalThis.expo, baseline);
        if (globalThis.expo[Symbol.for("vitest-native.expo.reset")]?.verify?.() === false) {
          throw stateFailure("Expo runtime state differs from the worker baseline");
        }
      }
    },
  });

  return {
    hotReset: () => manifest.beginFile(),
    bless,
    registerState: manifest.register,
    stateEntries: manifest.entries,
  };
}

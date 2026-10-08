// vitest-native/jest-compat/setup
//
// Add to `test.setupFiles` to give an existing Jest suite a `jest` global backed
// by Vitest's `vi`. Real RN suites lean on `jest.fn`/`jest.requireActual`/
// `jest.useFakeTimers` etc.; Vitest exposes the same API as `vi` minus the sync
// `requireActual`/`requireMock`, which we add here.
//
// Top-level `jest.mock(...)` hoisting: Vitest only hoists calls on the `vi`/
// `vitest` identifier, so a raw `jest.mock('react-native', factory)` would run
// AFTER imports and not apply. Add the `jestMockTransform()` plugin (exported from
// this entry) to rewrite top-level jest.mock/unmock/doMock to the hoisted vi.*
// form at transform time. `jest.fn`, `jest.spyOn`, `jest.requireActual`,
// `jest.useFakeTimers` work at runtime via the `jest` global installed here.
import { vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { jestMockInterop } from "./interop.mjs";
import { installJestObject } from "./jest-object.mjs";
import { callerFile } from "./caller.mjs";
import { VitestNativeError } from "../errors.mjs";
import { NODE_MOCKS_STATE_ID, config, nodeRegistry } from "./node-registry.mjs";

// The global `require` below resolves from the consumer project root.
const require = createRequire(path.join(config.projectRoot, "package.json"));

// Real Jest suites commonly clone-and-override React Native:
//   const RN = jest.requireActual('react-native'); RN.Platform = {...}; return RN
// Under the native engine RN's index is a CJS facade of lazy getters with no
// setters (see loader.mjs), so assigning to it throws "Cannot set property … which
// has only a getter" and takes the whole test file down at load. Jest's module is
// mutable, so match that: wrap the RN facade in a write-through proxy — reads fall
// through (keeping the getters lazy), writes are captured in an overlay so the
// override wins on later reads. Only `react-native` needs this; its submodules and
// other packages are ordinary mutable CJS.
function writableModuleFacade(mod) {
  if (mod == null || typeof mod !== "object") return mod;
  const overrides = new Map();
  return new Proxy(mod, {
    get: (target, prop) => (overrides.has(prop) ? overrides.get(prop) : Reflect.get(target, prop)),
    set: (_target, prop, value) => {
      overrides.set(prop, value);
      return true;
    },
    has: (target, prop) => overrides.has(prop) || Reflect.has(target, prop),
  });
}

/** The caller, for a relative specifier: Jest resolves those against the calling file. */
const callerOf = (spec) => (typeof spec === "string" && spec.startsWith(".") ? callerFile() : null);

// `jest.requireActual` is `Runtime.requireActual` → `requireModule(from, name, undefined,
// true)` (jest-runtime 29.7): the real module for THIS request, while the modules it
// loads still go through `requireModuleOrMock` and so still see the file's mocks. The
// registry's loader hook skips the mock for exactly this one load.
if (typeof vi.requireActual !== "function") {
  vi.requireActual = (m) => {
    const actual = nodeRegistry().require(m, callerOf(m), true);
    return m === "react-native" ? writableModuleFacade(actual) : actual;
  };
}
// `jest.requireMock` returns the module registered by `jest.mock(spec, factory)`, the
// same memoized value imports receive (`Runtime.requireMock` calls the factory once and
// caches it in `_mockRegistry`): the require goes through the registry's loader hook,
// which serves it. A module mocked without a factory — `__mocks__` or automock — has
// no Node-side mock, so it still loads the module itself.
if (typeof vi.requireMock !== "function") {
  vi.requireMock = (m) => nodeRegistry().require(m, callerOf(m));
}

// `jest.setTimeout(ms)` maps onto `vi.setConfig({ testTimeout })`, which applies for
// the rest of the file — the same scope Jest gives it, since Vitest resets the config
// after each test file.
//
// This used to be a silent no-op, on the grounds that there was no `vi` equivalent.
// There is. The cost of the no-op was not a crash but silence: a suite opening with
// `jest.setTimeout(30000)`, which is routine for slower React Native suites, kept
// Vitest's 5s default and its slow tests failed on time while the line that was
// supposed to prevent that sat there looking effective.
if (typeof vi.setTimeout !== "function") {
  vi.setTimeout = (ms) => {
    if (typeof vi.setConfig === "function" && typeof ms === "number") {
      vi.setConfig({ testTimeout: ms });
    }
  };
}

// `jest.advanceTimersByTime(Async)` is lenient in Jest: when fake timers are NOT
// active it's effectively a no-op. Vitest's `vi.advanceTimersByTimeAsync` instead
// throws "timers are not mocked". RNTL's `userEvent.setup({ advanceTimers })`
// commonly receives this function and calls it even on suites that never enable
// fake timers. Guard the two advance methods on `vi` itself (this file already
// extends `vi` above) to match Jest's leniency — done on `vi` rather than a wrapper
// so `globalThis.jest`, the `@jest/globals` shim (which exports `vi` as `jest`), and
// direct `vi` usage stay the same object.
//
// This file evaluates once per test file, and under the hot runtime `vi` survives
// between files, so the guard is installed once: re-wrapping per file would grow a
// chain of wrappers for as long as the worker lives.
const LENIENT_ADVANCE = Symbol.for("vitest-native.jest-compat.lenient-advance");
if (!vi.advanceTimersByTime[LENIENT_ADVANCE]) {
  const advanceTimersByTime = vi.advanceTimersByTime.bind(vi);
  const advanceTimersByTimeAsync = vi.advanceTimersByTimeAsync.bind(vi);
  vi.advanceTimersByTime = (...args) =>
    vi.isFakeTimers() ? advanceTimersByTime(...args) : undefined;
  vi.advanceTimersByTimeAsync = async (...args) =>
    vi.isFakeTimers() ? advanceTimersByTimeAsync(...args) : undefined;
  vi.advanceTimersByTime[LENIENT_ADVANCE] = true;
}

// Jest APIs that DO have a Vitest equivalent, under a different name. Each of these
// was missing, so a suite calling it hit `jest.X is not a function` — the bare
// TypeError the signposting below exists to avoid — even though the behaviour was
// available all along. `dontMock` is the sibling of the already-signposted
// `deepUnmock`, which is what marks these as omissions rather than decisions.
//
// `vi.doMock`/`vi.doUnmock` resolve a relative path against THEIR caller, which for
// these aliases is this file, so `jest.setMock('./x', …)` registered a mock for a
// module next to the shim and the test kept its previous mock. Anchor relative paths
// at the calling test file first, as Jest resolves them.
const anchoredAtCaller = (specifier) => {
  if (typeof specifier !== "string" || !specifier.startsWith(".")) return specifier;
  const caller = callerFile();
  return caller ? path.resolve(path.dirname(caller), specifier) : specifier;
};
// Both reach the Node-side registry too (node-registry.mjs), as jestMockTransform's
// rewrites of jest.doMock/doUnmock do: `jest.setMock` is `setMockFactory(name, () =>
// mock)` in jest-runtime, the same registry `jest.mock` writes to.
if (typeof vi.dontMock !== "function") {
  vi.dontMock = (m) => {
    nodeRegistry().unregister(callerOf(m), m);
    return vi.doUnmock(anchoredAtCaller(m));
  };
}
if (typeof vi.setMock !== "function") {
  vi.setMock = (m, exports) => {
    nodeRegistry().register(callerOf(m), m, () => exports);
    return vi.doMock(anchoredAtCaller(m), () => exports);
  };
}
// `Date.now()` alone is right for both clocks: Vitest's fake timers replace Date, so
// this returns the faked time when they are active and the real time otherwise —
// which is what jest.now() reports. An earlier version consulted
// vi.getMockedSystemTime() first; removing that branch changed no observable
// behaviour, so it was complexity no test could distinguish.
if (typeof vi.now !== "function") vi.now = () => Date.now();

// Jest APIs with NO Vitest equivalent would otherwise surface as bare
// "jest.isolateModules is not a function" TypeErrors deep in a migrated suite.
// Give each one an error that names the API and states the closest migration,
// so the failure is a signpost instead of a mystery.
const MIGRATION_GUIDE =
  "https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/docs/migrating-from-jest.md";
function unsupported(name, guidance) {
  if (typeof vi[name] === "function") return;
  vi[name] = () => {
    throw new VitestNativeError(
      "JEST_API_UNSUPPORTED",
      `jest.${name}() has no Vitest equivalent. ${guidance}`,
      { docs: MIGRATION_GUIDE },
    );
  };
}
unsupported(
  "createMockFromModule",
  "Build the mock explicitly with vi.fn()/vi.mock(), or import the real module and override members.",
);
unsupported(
  "genMockFromModule",
  "Build the mock explicitly with vi.fn()/vi.mock(), or import the real module and override members.",
);
unsupported("deepUnmock", "Use vi.unmock()/vi.doUnmock() per module.");
unsupported("unstable_mockModule", "Use vi.doMock(path, factory), which mocks ESM too.");
unsupported(
  "replaceProperty",
  "Assign the property and restore it yourself, or use vi.spyOn(obj, key, 'get') for an accessor.",
);
// Vitest has no automocking at all, so these cannot be approximated — the whole
// premise (every module auto-replaced with mocks) does not exist. Naming that is more
// useful than a TypeError.
for (const name of [
  "enableAutomock",
  "disableAutomock",
  "autoMockOff",
  "autoMockOn",
  "onGenerateMock",
]) {
  unsupported(name, "Vitest has no automocking; mock each module explicitly with vi.mock().");
}
// jest.retryTimes configures retries at runtime; Vitest configures them statically.
// Warn once and continue — crashing a suite over retry policy helps nobody.
if (typeof vi.retryTimes !== "function") {
  let warned = false;
  vi.retryTimes = () => {
    if (!warned) {
      warned = true;
      console.warn(
        `[vitest-native] jest.retryTimes() is ignored under Vitest — set test.retry in your vitest config (or per-test: test('name', { retry: N }, fn)).`,
      );
    }
  };
}

// `vi`, with Jest's semantics for the mocks `jest.fn`/`jest.spyOn` create (see
// jest-object.mjs). Everything else, including the members installed above, is `vi`.
// The module-registry members are the `jest` object's own, not `vi`'s: `vi.resetModules`
// keeps Vitest's meaning, and Vitest has no isolateModules to extend.
globalThis.jest = installJestObject(vi, { resetModules, isolateModules, isolateModulesAsync });

// Jest sets `JEST_WORKER_ID` in every worker (jest-worker: `JEST_WORKER_ID:
// String(workerId + 1)`; jest-runner sets "1" when running in band), and code written for Jest tests
// for it to detect a test run — e.g. picking a local or production endpoint with
// `__DEV__ && !process.env.JEST_WORKER_ID`. Unset, that code takes its non-test
// branch. Vitest's equivalent is `VITEST_POOL_ID`, also a 1-based string, between 1
// and maxWorkers, so it is the same value Jest would have given this worker. A value
// already in the environment is left alone.
if (process.env.JEST_WORKER_ID === undefined) {
  process.env.JEST_WORKER_ID = process.env.VITEST_POOL_ID ?? "1";
}

// jest.mock factories are wrapped by jestMockTransform to route their return
// value through Jest's CommonJS interop (so `import X from` sees the whole mock,
// and `() => Component` factories work). The wrapper calls this global.
if (typeof globalThis.__vnInteropMock !== "function") globalThis.__vnInteropMock = jestMockInterop;

// The Node-side registry (node-registry.mjs): jestMockTransform registers each factory
// with __vnJestMock where Vitest hoists it, and Vitest's factory (__vnJestMocked) returns
// the memoized value through the CJS interop; Node's `require` gets the raw value.
{
  const registry = nodeRegistry();
  globalThis.__vnJestMock = (from, spec, factory) => void registry.register(from, spec, factory);
  globalThis.__vnJestMocked = (from, spec) => {
    const entry = registry.byCall.get(`${from}\0${spec}`);
    if (entry === undefined) {
      throw new VitestNativeError(
        "JEST_API_UNSUPPORTED",
        `the jest.mock('${spec}') factory was not registered in this test file.`,
      );
    }
    return jestMockInterop(registry.valueOf(entry));
  };
  globalThis.__vnJestUnmock = (from, spec) => registry.unregister(from, spec);
  // Registrations are per test file, as in Jest. This file evaluates before each test
  // file, so a worker reused without the hot runtime (`isolate: false`, or a watch
  // rerun of the same file) starts each one empty here. The hot runtime clears them at
  // the file boundary instead, through its state manifest, which verifies it did.
  if (!globalThis.__vitest_native_hot_reset) registry.clear();
  // Hot runtime: cleared at the file boundary and verified empty (state-manifest.mjs).
  globalThis.__vitest_native_register_state?.({
    id: NODE_MOCKS_STATE_ID,
    capture: () => null,
    restore: () => registry.clear(),
    verify: () => {
      if (!registry.isEmpty()) {
        throw new VitestNativeError(
          "HOT_STATE_RESTORE_FAILED",
          `${registry.entries.size + registry.unresolved.size} jest.mock registrations remain`,
        );
      }
    },
  });
}

/** `jest.resetModules()`: see `resetModules` in node-registry.mjs. */
function resetModules() {
  if (!nodeRegistry().resetModules()) vi.resetModules();
}

/** `jest.isolateModules(fn)` / `isolateModulesAsync(fn)`: see `isolate` in node-registry.mjs. */
function isolateModules(fn) {
  const end = nodeRegistry().isolate("isolateModules", "isolateModulesAsync");
  try {
    fn();
  } finally {
    end();
  }
}
async function isolateModulesAsync(fn) {
  const end = nodeRegistry().isolate("isolateModulesAsync", "isolateModules");
  try {
    await fn();
  } finally {
    end();
  }
}

// Jest test modules (and `jest.mock` factories) routinely call `require(...)`
// synchronously — e.g. `jest.mock('x', () => require('react-native').View)`. ESM
// test modules have no `require` binding, so provide a global one resolved from the
// project root. Guarded so it never clobbers an existing CJS `require`.
if (typeof globalThis.require !== "function") globalThis.require = require;

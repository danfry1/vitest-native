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
import { afterAll, beforeEach, expect, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { jestMockInterop } from "./interop.mjs";
import { installJestObject } from "./jest-object.mjs";
import { callerFile } from "./caller.mjs";
import { errorsWithMethodsEquality } from "./error-equality.mjs";
import { VitestNativeError } from "../errors.mjs";
import { projectContext } from "../context.mjs";
import { NODE_MOCKS_STATE_ID, actualExports, config, nodeRegistry } from "./node-registry.mjs";
import { nodeDispatch } from "../node-dispatch.mjs";
import { JEST_COMPAT_SHIM_FILES } from "./aliases.mjs";
import { fileURLToPath } from "node:url";

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
const UNSUPPORTED_DOCS =
  "https://danfry1.github.io/vitest-native/guide/errors#JEST_API_UNSUPPORTED";
function unsupported(name, guidance) {
  if (typeof vi[name] === "function") return;
  vi[name] = () => {
    throw new VitestNativeError(
      "JEST_API_UNSUPPORTED",
      `jest.${name}() has no Vitest equivalent. ${guidance}`,
      { docs: UNSUPPORTED_DOCS },
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
// The module-registry members, replaceProperty and restoreAllMocks are the `jest` object's
// own, not `vi`'s: `vi.resetModules` and `vi.restoreAllMocks` keep Vitest's meaning, and
// Vitest has neither isolateModules nor replaceProperty to extend.
// `jest.replaceProperty(object, key, value)`, as jest-mock 29.7's ModuleMocker has it:
// the same checks and messages, the value assigned in place (the property stays a plain,
// writable value), and the returned `{ replaceValue, restore }`. A second replacement of
// the same property reuses the first, so restoring gives back the original. Restored by
// `restore()`, by `jest.restoreAllMocks()`, before each test where the project sets
// `restoreMocks` (as Jest's setting does; Vitest's restores only its own mocks), and when
// the test file ends, since Jest's next file has fresh modules and a reused worker
// (`isolate: false`, the hot runtime) keeps them. A bare `vi.restoreAllMocks()` leaves
// them, as it is Vitest's own.
const replacedProperties = new Set();
function typeOfValue(value) {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}
// jest-mock's own errors, as it throws them: a plain Error with Jest's message, which a
// suite written for Jest asserts on (Vitest's toThrow with an error instance compares the
// whole error, name included). The one place this file builds one.
function jestMockError(jestMessage) {
  return new Error(jestMessage);
}
function replaceProperty(object, propertyKey, value) {
  if (object == null || (typeof object !== "object" && typeof object !== "function")) {
    throw jestMockError(
      `Cannot use replaceProperty on a primitive value; ${typeOfValue(object)} given`,
    );
  }
  if (propertyKey == null) throw jestMockError("No property name supplied");
  const name = String(propertyKey);
  let descriptor = Object.getOwnPropertyDescriptor(object, propertyKey);
  for (let proto = Object.getPrototypeOf(object); !descriptor && proto !== null;) {
    descriptor = Object.getOwnPropertyDescriptor(proto, propertyKey);
    proto = Object.getPrototypeOf(proto);
  }
  if (!descriptor)
    throw jestMockError(`Property \`${name}\` does not exist in the provided object`);
  if (!descriptor.configurable) {
    throw jestMockError(`Property \`${name}\` is not declared configurable`);
  }
  if (descriptor.get !== undefined) {
    throw jestMockError(
      `Cannot replace the \`${name}\` property because it has a getter. Use \`jest.spyOn(object, '${name}', 'get').mockReturnValue(value)\` instead.`,
    );
  }
  if (descriptor.set !== undefined) {
    throw jestMockError(
      `Cannot replace the \`${name}\` property because it has a setter. Use \`jest.spyOn(object, '${name}', 'set').mockReturnValue(value)\` instead.`,
    );
  }
  if (typeof descriptor.value === "function") {
    throw jestMockError(
      `Cannot replace the \`${name}\` property because it is a function. Use \`jest.spyOn(object, '${name}')\` instead.`,
    );
  }
  for (const entry of replacedProperties) {
    if (entry.object === object && entry.property === propertyKey) {
      return entry.replaced.replaceValue(value);
    }
  }
  const isPropertyOwner = Object.prototype.hasOwnProperty.call(object, propertyKey);
  const originalValue = descriptor.value;
  const entry = {
    object,
    property: propertyKey,
    restore() {
      if (isPropertyOwner) object[propertyKey] = originalValue;
      else delete object[propertyKey];
    },
    replaced: {
      replaceValue(next) {
        object[propertyKey] = next;
        return entry.replaced;
      },
      restore() {
        entry.restore();
        replacedProperties.delete(entry);
      },
    },
  };
  // Recorded only once the assignment has worked: a property that is configurable but
  // not writable throws here, and an entry for it would throw again on every restore.
  entry.replaced.replaceValue(value);
  replacedProperties.add(entry);
  return entry.replaced;
}
function restoreReplacedProperties() {
  // Cleared first, so one restore that throws does not leave the others to throw again.
  const entries = [...replacedProperties];
  replacedProperties.clear();
  for (const entry of entries) entry.restore();
}
/** `jest.restoreAllMocks()`: replaced properties, then Vitest's mocks, which run regardless. */
function restoreAllMocks() {
  try {
    restoreReplacedProperties();
  } finally {
    vi.restoreAllMocks();
  }
  return globalThis.jest;
}
if (projectContext()?.restoreMocks === true) beforeEach(restoreReplacedProperties);
afterAll(restoreReplacedProperties);

globalThis.jest = installJestObject(vi, {
  resetModules,
  isolateModules,
  isolateModulesAsync,
  replaceProperty,
  restoreAllMocks,
});

// Two identical errors whose class assigns methods as instance fields (zod 3's
// ZodError) are never equal under Vitest, which compares an error's own properties and
// so its per-instance closures; Jest compares errors by message. See error-equality.mjs
// for why the tester ignores only those methods rather than adopting Jest's rule.
//
// The testers live in Vitest's expect state, which outlives this file under the hot
// runtime, and each evaluation of this file brings a new function. Look for a tester
// carrying the marker in the list itself (`globalThis[Symbol.for('$$jest-matchers-
// object')]` is where `expect.addEqualityTesters` pushes, in Jest and Vitest alike), so
// it is registered once however many files the worker runs.
const ERROR_METHODS_EQUALITY = Symbol.for("vitest-native.jest-compat.error-methods-equality");
{
  const registered = globalThis[Symbol.for("$$jest-matchers-object")]?.customEqualityTesters;
  if (!registered?.some((tester) => tester?.[ERROR_METHODS_EQUALITY])) {
    errorsWithMethodsEquality[ERROR_METHODS_EQUALITY] = true;
    expect.addEqualityTesters([errorsWithMethodsEquality]);
  }
}

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
  globalThis.__vnJestMock = (from, spec, factory, asyncFactory) =>
    void registry.register(from, spec, factory, asyncFactory);
  globalThis.__vnJestMocked = (from, spec) => {
    const entry = registry.byCall.get(`${from}\0${spec}`);
    if (entry === undefined) {
      throw new VitestNativeError(
        "JEST_API_UNSUPPORTED",
        `the jest.mock('${spec}') factory was not registered in this test file.`,
      );
    }
    return jestMockInterop(registry.valueForImport(entry));
  };
  // A factory's `jest.requireActual` of project source that jestMockTransform moved to
  // `vi.importActual` (transform.ts) gets its result in the shape requireActual gives.
  globalThis.__vnActualExports = actualExports;
  globalThis.__vnJestUnmock = (from, spec) => registry.unregister(from, spec);
  // Registrations are per test file, as in Jest. This file evaluates before each test
  // file, so a worker reused without the hot runtime (`isolate: false`, or a watch
  // rerun of the same file) starts each one empty here. The hot runtime clears them at
  // the file boundary instead, through its state manifest, which verifies it did.
  if (!globalThis.__vitest_native_hot_reset) registry.clear({ keepLibrary: true });
  // Hot runtime: cleared at the file boundary and verified empty (state-manifest.mjs).
  globalThis.__vitest_native_register_state?.({
    id: NODE_MOCKS_STATE_ID,
    // Before the value-based React Native restores. They reach their module through
    // Node's loader (react-native's index getters `require` it), and while the
    // previous file's `jest.mock` is still registered that load returns the mock:
    // `jest.mock('react-native/Libraries/Utilities/Appearance', () => null)` made the
    // Appearance restore read `null.setColorScheme` and fail the NEXT file's reset.
    restoreOrder: -100,
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

// A require() of a package jest-compat replaces gets the shim (JEST_COMPAT_SHIM_FILES, files
// beside this one), as an import does through
// the same alias. The package itself throws when loaded outside Jest ("Do not import
// `@jest/globals` outside of the Jest test environment"), so the installed one is never
// the answer, for a test file, a project module or a library alike; this is unlike the
// project's other aliases, which apply in Node only where Node finds nothing
// (native/hooks.mjs).
const shimFiles = new Map();
nodeDispatch().load.add(
  "jestCompatShims",
  (next) =>
    function (request, parent, ...rest) {
      if (typeof request !== "string" || request.startsWith(".") || path.isAbsolute(request)) {
        return next(request, parent, ...rest);
      }
      let file = shimFiles.get(request);
      if (file === undefined) {
        const target = JEST_COMPAT_SHIM_FILES[config.expandAlias(request)];
        file = target ? fileURLToPath(new URL(target, import.meta.url)) : null;
        shimFiles.set(request, file);
      }
      return next(file ?? request, parent, ...rest);
    },
);

// `View.prototype`, as React Native's Jest preset has it: its stand-in for View is a
// class with the native methods (measure, measureInWindow, measureLayout, setNativeProps,
// focus, blur) on the prototype, so suites spy on them there
// (`jest.spyOn(View.prototype, 'measure')`) and read them at load
// (`Object.getOwnPropertyDescriptor(View.prototype, ...)`). React Native's own View has no
// prototype.
//
// The prototype given is the native methods object of the native engine's host class for
// RCTView (src/native/boundary.mjs): one class per view name, whose methods delegate to
// that object, so a spy on it reaches every View ref. A plain object, not the class's
// prototype, which would make React construct the component as a class. Under the mock
// engine, whose registry has no such class, nothing is set. Only here, in the
// Jest-semantics layer: the engine itself keeps React Native's View as it is.
//
// View only: every test that renders React Native loads View anyway, while setting Text's
// and ScrollView's here would load them, and their graphs, in every test file (63 and 142
// React Native modules against View's 19; tests-native/rn-facade-cost.test.ts). Exposing
// those lazily, once something loads them, is a follow-up.
function exposeNativeMethods() {
  const reactNative = require("react-native");
  const { get } = require("react-native/Libraries/NativeComponent/NativeComponentRegistry");
  for (const [component, viewName] of [["View", "RCTView"]]) {
    const target = reactNative[component];
    if (target == null) continue;
    // No prototype (a forwardRef object, an arrow function), or an ordinary function's
    // untouched one; never a class's or one someone has already filled.
    const own = target.prototype;
    const replaceable =
      own === undefined ||
      (!own.isReactComponent &&
        Object.getOwnPropertyNames(own).every((key) => key === "constructor"));
    if (!replaceable) continue;
    const methods = typeof get === "function" ? get(viewName)?.nativeMethods : undefined;
    if (methods == null || typeof methods.measure !== "function") continue;
    // An ordinary function's own prototype is writable but not configurable.
    if (own === undefined) {
      Object.defineProperty(target, "prototype", {
        value: methods,
        configurable: true,
        writable: true,
      });
    } else {
      target.prototype = methods;
    }
  }
}
exposeNativeMethods();

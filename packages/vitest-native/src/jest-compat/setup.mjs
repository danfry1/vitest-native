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
import { fileURLToPath } from "node:url";
import path from "node:path";
import { jestMockInterop } from "./interop.mjs";
import { VitestNativeError } from "../errors.mjs";

// Resolve modules from the consumer project root, not this file's location, so
// `jest.requireActual('some-project-dep')` resolves the same module the suite sees.
const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
const require = createRequire(path.join(projectRoot, "package.json"));

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

/**
 * The file that called into here, taken from the stack.
 *
 * Jest resolves a relative `requireActual('../x')` against the CALLING module. This
 * shim had a single require anchored at the project root, so bare specifiers worked
 * and relative ones escaped the source tree: `jest.requireActual('../thing')` threw
 * MODULE_NOT_FOUND with a requireStack pointing at <projectRoot>/package.json, which
 * is a confusing place to be sent when the file sits next to the test.
 *
 * The stack is the only thing that knows the caller. These are plain runtime calls
 * on the `jest` global, not rewritten at transform time, so there is no import.meta
 * to consult.
 */
function callerFile() {
  const original = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_, frames) => frames;
    const frames = new Error().stack;
    for (const frame of frames) {
      const file = typeof frame.getFileName === "function" ? frame.getFileName() : null;
      if (!file || file.startsWith("node:") || file.includes("/jest-compat/")) continue;
      return file.startsWith("file://") ? fileURLToPath(file) : file;
    }
  } catch {
    // Fall through to the project-root require below.
  } finally {
    Error.prepareStackTrace = original;
  }
  return null;
}

/** Resolve as Jest does: relative against the caller, bare from the project root. */
function requireFrom(specifier) {
  if (typeof specifier === "string" && specifier.startsWith(".")) {
    const caller = callerFile();
    // A caller-relative miss is the honest answer. Falling back to the project root
    // could resolve some other file that happens to sit at the same relative path.
    if (caller) return createRequire(caller)(specifier);
  }
  return require(specifier);
}

if (typeof vi.requireActual !== "function")
  vi.requireActual = (m) =>
    m === "react-native" ? writableModuleFacade(require(m)) : requireFrom(m);
if (typeof vi.requireMock !== "function") vi.requireMock = (m) => requireFrom(m);
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
const advanceTimersByTime = vi.advanceTimersByTime.bind(vi);
const advanceTimersByTimeAsync = vi.advanceTimersByTimeAsync.bind(vi);
vi.advanceTimersByTime = (...args) =>
  vi.isFakeTimers() ? advanceTimersByTime(...args) : undefined;
vi.advanceTimersByTimeAsync = async (...args) =>
  vi.isFakeTimers() ? advanceTimersByTimeAsync(...args) : undefined;

// Jest APIs that DO have a Vitest equivalent, under a different name. Each of these
// was missing, so a suite calling it hit `jest.X is not a function` — the bare
// TypeError the signposting below exists to avoid — even though the behaviour was
// available all along. `dontMock` is the sibling of the already-signposted
// `deepUnmock`, which is what marks these as omissions rather than decisions.
if (typeof vi.dontMock !== "function") vi.dontMock = (m) => vi.doUnmock(m);
if (typeof vi.setMock !== "function") vi.setMock = (m, exports) => vi.doMock(m, () => exports);
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
  "isolateModules",
  "Use vi.resetModules() plus a dynamic import() to get a fresh module copy.",
);
unsupported(
  "createMockFromModule",
  "Build the mock explicitly with vi.fn()/vi.mock(), or import the real module and override members.",
);
unsupported(
  "genMockFromModule",
  "Build the mock explicitly with vi.fn()/vi.mock(), or import the real module and override members.",
);
unsupported("deepUnmock", "Use vi.unmock()/vi.doUnmock() per module.");
unsupported(
  "isolateModulesAsync",
  "Use vi.resetModules() plus a dynamic import() to get a fresh module copy.",
);
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

globalThis.jest = vi;

// jest.mock factories are wrapped by jestMockTransform to route their return
// value through Jest's CommonJS interop (so `import X from` sees the whole mock,
// and `() => Component` factories work). The wrapper calls this global.
if (typeof globalThis.__vnInteropMock !== "function") globalThis.__vnInteropMock = jestMockInterop;

// Jest test modules (and `jest.mock` factories) routinely call `require(...)`
// synchronously — e.g. `jest.mock('x', () => require('react-native').View)`. ESM
// test modules have no `require` binding, so provide a global one resolved from the
// project root. Guarded so it never clobbers an existing CJS `require`.
if (typeof globalThis.require !== "function") globalThis.require = require;

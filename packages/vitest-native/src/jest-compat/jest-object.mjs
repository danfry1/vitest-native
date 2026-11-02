// The `jest` object the compat layer hands out: Vitest's `vi`, except for the mock
// factories, whose semantics differ from Jest's in one place real suites depend on.
//
// Jest's mock function (jest-mock's ModuleMocker, `_makeComponent`) runs its
// implementation as `mockImpl.apply(this, arguments)` whether or not it was invoked
// with `new`. A constructor call therefore works with any implementation, arrows
// included: `new` returns the implementation's result when that is an object, and the
// fresh instance otherwise — ordinary [[Construct]] semantics for a function that
// returns a value. So this is routine in Jest suites, and passes:
//
//   jest.mock('x', () => ({ Api: jest.fn().mockImplementation(() => ({ fetch })) }))
//   new Api()   // → { fetch }
//
// Vitest 4+ constructs the implementation itself (`Reflect.construct(impl, args,
// new.target)` in @vitest/spy), so an arrow implementation throws `… is not a
// constructor`, and `mockReturnValue`/`mockResolvedValue` throw a dedicated error
// under `new`. That is a deliberate Vitest design, so `vi.fn` is left exactly as it
// is: only the mocks made through `jest.fn`/`jest.spyOn` get Jest's behaviour.
//
// It is done by adapting the implementation rather than the mock. A non-constructible
// implementation (arrow, method shorthand, async or generator function) is passed to
// Vitest inside a plain `function` that applies it — which is constructible, so
// Vitest's `Reflect.construct` calls it with the new instance as `this`, and its
// object result, if any, becomes the result of `new`. A constructible implementation
// (`function`, `class`) is passed unchanged, so classes keep Vitest's construction
// (Jest's own `.apply` would throw "Class constructor cannot be invoked without
// 'new'" there; nobody depends on that). Everything else — `.mock.calls`,
// `.mock.instances`, `vi.isMockFunction`, `jest.mocked`, reset/restore — is Vitest's
// own mock, untouched.
//
// The value-returning helpers are redefined the way jest-mock defines them,
// `mockReturnValue(v)` as `mockImplementation(() => v)` and so on, so they follow the
// same rule.

const JEST_SEMANTICS = Symbol.for("vitest-native.jest-compat.jest-semantics");

/** The implementation each adapter wraps, so `getMockImplementation()` returns what was passed. */
const adapted = new WeakMap();

/**
 * Whether `fn` has [[Construct]]. `Reflect.construct` checks its `newTarget` before
 * calling anything, and the target here is `String`, so this never runs `fn`.
 */
function isConstructor(fn) {
  try {
    Reflect.construct(String, [], fn);
    return true;
  } catch {
    return false;
  }
}

const NOT_COPIED = new Set(["length", "name", "prototype", "caller", "arguments"]);

function asJestImplementation(impl) {
  if (typeof impl !== "function" || isConstructor(impl)) return impl;
  const adapter = function (...args) {
    return impl.apply(this, args);
  };
  // No prototype of its own: @vitest/spy re-parents `mock.prototype` onto the
  // implementation's prototype, and an arrow has none, so leaving one here would put
  // an unrelated empty object into every instance's chain.
  adapter.prototype = undefined;
  Object.defineProperty(adapter, "length", { value: impl.length, configurable: true });
  Object.defineProperty(adapter, "name", { value: impl.name, configurable: true });
  // Vitest copies the implementation's static members onto the mock (`jest.fn(impl)`
  // exposing `impl.x` as `mock.x`); it reads them from what it is given, so give it them.
  for (const key of Reflect.ownKeys(impl)) {
    if (NOT_COPIED.has(key)) continue;
    Object.defineProperty(adapter, key, Object.getOwnPropertyDescriptor(impl, key));
  }
  adapted.set(adapter, impl);
  return adapter;
}

/** Adapters standing in for a spy's original, which Vitest reports as no implementation. */
const spyDefaults = new WeakSet();

/**
 * Give a Vitest mock Jest's handling of implementations under `new`.
 *
 * `original` is a spy's original function. With no implementation set, Vitest falls
 * back to it and, under `new`, constructs it — which throws for an arrow. jest-mock's
 * spyOn instead installs `function () { return original.apply(this, arguments) }` as
 * the implementation, so `new` on a spied arrow calls it. A non-constructible original
 * is therefore installed through the same adapter as the spy's resting implementation:
 * re-installed after `mockReset()` (which Vitest's `mockRestore()` also calls), and
 * reported by `getMockImplementation()` as Vitest reports a bare spy — `undefined`.
 */
function withJestSemantics(mock, original) {
  if (mock[JEST_SEMANTICS]) return mock;
  const {
    mockImplementation,
    mockImplementationOnce,
    withImplementation,
    getMockImplementation,
    mockReset,
  } = mock;
  mock.mockImplementation = (impl) => mockImplementation.call(mock, asJestImplementation(impl));
  mock.mockImplementationOnce = (impl) =>
    mockImplementationOnce.call(mock, asJestImplementation(impl));
  mock.withImplementation = (impl, callback) =>
    withImplementation.call(mock, asJestImplementation(impl), callback);
  mock.getMockImplementation = () => {
    const impl = getMockImplementation.call(mock);
    if (spyDefaults.has(impl)) return undefined;
    return adapted.get(impl) ?? impl;
  };
  const resting = typeof original === "function" ? asJestImplementation(original) : original;
  if (resting !== original) {
    spyDefaults.add(resting);
    mockImplementation.call(mock, resting);
    mock.mockReset = () => {
      mockReset.call(mock);
      mockImplementation.call(mock, resting);
      return mock;
    };
  }
  // As jest-mock defines them (packages/jest-mock/src/index.ts).
  mock.mockReturnValue = (value) => mock.mockImplementation(() => value);
  mock.mockReturnValueOnce = (value) => mock.mockImplementationOnce(() => value);
  mock.mockResolvedValue = (value) => mock.mockImplementation(() => Promise.resolve(value));
  mock.mockResolvedValueOnce = (value) => mock.mockImplementationOnce(() => Promise.resolve(value));
  mock.mockRejectedValue = (value) => mock.mockImplementation(() => Promise.reject(value));
  mock.mockRejectedValueOnce = (value) => mock.mockImplementationOnce(() => Promise.reject(value));
  Object.defineProperty(mock, JEST_SEMANTICS, { value: true });
  return mock;
}

/**
 * The function a method spy will wrap, read as `vi.spyOn` reads it: `object[key]`.
 * For an accessor that runs the getter, which Vitest does too (it calls the getter
 * of a Vite SSR export to reach the function), so this adds no new kind of effect.
 */
function originalOf(object, key, accessType) {
  if (accessType !== undefined || object == null) return undefined;
  try {
    return object[key];
  } catch {
    return undefined; // let vi.spyOn report the property in its own words
  }
}

// `jest.useFakeTimers(config)` takes Jest's options, which are not Vitest's. Vitest
// spreads its argument straight into @sinonjs/fake-timers' `install`, so passing
// Jest's keys through unchanged drops them without a word: `{ advanceTimers: true }`
// never advanced, `{ doNotFake: ['performance'] }` faked it anyway. Jest translates
// them in `_toSinonFakeTimersConfig` (@jest/fake-timers 30.2, modernFakeTimers):
//
//   advanceTimeDelta: typeof advanceTimers === 'number' ? advanceTimers : undefined,
//   loopLimit: timerLimit || 100_000,
//   now: now ?? Date.now(),
//   shouldAdvanceTime: Boolean(advanceTimers),
//   shouldClearNativeTimers: true,
//   toFake: every fakeable API minus doNotFake,
//
// and that translation is mirrored here, with these deliberate differences:
//
// - A Jest option left out is left to Vitest, so a project's `test.fakeTimers` (the
//   nearest thing to Jest's `fakeTimers` config, which Jest merges into every call)
//   still applies. Jest's defaults and Vitest's agree for every key but two, which are
//   always passed: `loopLimit` (Jest 100_000, Vitest 10_000), and `now`, which Jest
//   reads from the real clock on every install while Vitest resumes the last fake one.
//   A `now` set in `test.fakeTimers` is therefore overridden, as in Jest only an
//   explicit `now` sets the start.
// - `nextTick` and `queueMicrotask` stay real. Jest fakes them by default; Vitest
//   never fakes them unless asked, because Node and Vitest's runner use them
//   internally ("Do not mock timers internally used by node by default", Vitest's
//   FakeTimers.useFakeTimers). This keeps Vitest's choice.
// - `doNotFake` becomes an explicit `toFake`. Vitest 5 also accepts `toNotFake`, but
//   Vitest 4 always passes its own `toFake` to sinon, whose bundled version has no
//   `toNotFake` at all, so only `toFake` means the same on every supported major.
// - `legacyFakeTimers: true` has no Vitest counterpart (Jest's legacy timers are
//   jest.fn mocks). It is approximated with modern timers over the functions legacy
//   timers replace, leaving Date real as they do, and warns once that assertions on
//   the timer functions themselves cannot work.
//
// Known limitation: options given before React Native Testing Library loads do not
// survive it. At import RNTL calls `jest.useRealTimers()` and then
// `jest.useFakeTimers({ legacyFakeTimers: false })` (helpers/timers runWithRealTimers),
// which this translates without the earlier options, so a setup file's top-level
// `jest.useFakeTimers({ doNotFake })` ends up faking everything. Jest merges its
// project `fakeTimers` config into that call; carrying a setup file's options across
// it belongs to a versioned environment layer, not to this shim. Until then the docs
// recommend a `beforeEach` call or Vitest's `test.fakeTimers`.

/**
 * Every API @sinonjs/fake-timers can fake: its `FakeMethod` typedef, as bundled in
 * Vitest 5.0. Names the running sinon lacks are skipped (Vitest installs with
 * `ignoreMissingTimers: true`); tests/jest-compat-fake-timers.test.ts fails if the
 * installed sinon gains a name this list lacks.
 */
export const FAKEABLE_TIMER_APIS = [
  "setTimeout",
  "clearTimeout",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "Date",
  "nextTick",
  "hrtime",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "performance",
  "queueMicrotask",
  "Intl",
  "Temporal",
];

/** Faked only when asked for by name, as Vitest's own default list leaves them out. */
const KEPT_REAL = new Set(["nextTick", "queueMicrotask"]);

/**
 * What Jest's legacy timers replace (LegacyFakeTimers.useFakeTimers, @jest/fake-timers
 * 30.2): the timer functions and animation frames, never Date. `process.nextTick`,
 * which they also replace, stays real for the reason above.
 */
const LEGACY_FAKED = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "requestAnimationFrame",
  "cancelAnimationFrame",
];

/** Jest's `timerLimit || 100_000`. */
const loopLimitOf = (timerLimit) => timerLimit || 100_000;

/**
 * Translate a Jest fake-timers config into the one `vi.useFakeTimers` takes. Keys that
 * are not Jest's (a Vitest option passed through `jest.*`) are kept as given.
 */
export function toVitestFakeTimersConfig(config, realNow = Date.now) {
  const { advanceTimers, doNotFake, legacyFakeTimers, now, timerLimit, ...rest } = config ?? {};
  const out = { ...rest, loopLimit: loopLimitOf(timerLimit) };
  if (legacyFakeTimers) {
    // Legacy timers take no options of their own: no auto-advance, no clock to set.
    return { ...out, shouldAdvanceTime: false, toFake: [...LEGACY_FAKED] };
  }
  if (advanceTimers !== undefined) {
    out.shouldAdvanceTime = Boolean(advanceTimers);
    if (typeof advanceTimers === "number") out.advanceTimeDelta = advanceTimers;
  }
  // Jest's `now ?? Date.now()`, read from the real clock on every install. Left out,
  // Vitest would start the new clock where the last fake one stopped, so a date one
  // test pinned with setSystemTime leaked into every later jest.useFakeTimers().
  out.now = now ?? realNow();
  if (doNotFake !== undefined) {
    const real = new Set(doNotFake);
    out.toFake = FAKEABLE_TIMER_APIS.filter((api) => !KEPT_REAL.has(api) && !real.has(api));
  }
  return out;
}

let warnedLegacy = false;
function warnLegacyOnce() {
  if (warnedLegacy) return;
  warnedLegacy = true;
  console.warn(
    "[vitest-native] jest.useFakeTimers({ legacyFakeTimers: true }) runs Vitest's modern " +
      "fake timers over setTimeout/setInterval/setImmediate/requestAnimationFrame, with " +
      "Date left real. The timer functions are not mock functions, so legacy-only " +
      "assertions such as expect(setTimeout).toHaveBeenCalled() are not supported.",
  );
}

/**
 * The `jest` object: `vi` for everything except `fn`, `spyOn`, `useFakeTimers` and
 * `useRealTimers`. A proxy rather than a copy, so members the compat setup installs
 * on `vi` (requireActual, the timer guards), and anything a suite assigns to
 * `jest.*`, stay one shared object.
 */
export function createJestObject(vi, members = {}) {
  function fn(impl) {
    // `vi.fn(existingMock)` returns that mock; it is someone else's, so leave it be.
    if (vi.isMockFunction(impl)) return vi.fn(impl);
    return withJestSemantics(vi.fn(asJestImplementation(impl)));
  }
  function spyOn(...args) {
    const original = originalOf(...args);
    const spy = vi.spyOn(...args);
    // Likewise `vi.spyOn` on a property that already holds a mock — a plain value or
    // one an accessor returns — returns that mock.
    if (vi.isMockFunction(original) && spy === original) return spy;
    return withJestSemantics(spy, original);
  }
  // Jest's options translated (see toVitestFakeTimersConfig), and Jest's return value:
  // both return the `jest` object (jest-runtime's `useFakeTimers`/`useRealTimers`), so
  // `jest.useFakeTimers().setSystemTime(…)` chains on `jest`, not on `vi`.
  function useFakeTimers(config) {
    if (config?.legacyFakeTimers) warnLegacyOnce();
    vi.useFakeTimers(toVitestFakeTimersConfig(config, () => vi.getRealSystemTime()));
    return jest;
  }
  function useRealTimers() {
    vi.useRealTimers();
    return jest;
  }
  // Assigning `jest.fn`/`jest.spyOn` (a suite or library patching them) replaces them
  // here, as assigning to `jest` did when it was `vi`, without patching `vi` itself.
  // Any other assignment goes to `vi`, which the compat setup and suites share.
  const own = new Map([
    ["fn", fn],
    ["spyOn", spyOn],
    ["useFakeTimers", useFakeTimers],
    ["useRealTimers", useRealTimers],
    // Jest's module-registry members, supplied by the compat setup (setup.mjs).
    ...Object.entries(members),
  ]);
  const jest = new Proxy(vi, {
    get(target, prop, receiver) {
      if (own.has(prop)) return own.get(prop);
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (own.has(prop)) {
        own.set(prop, value);
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  });
  return jest;
}

// One `jest` per test file, shared by the global and `@jest/globals`, as in Jest where
// `import { jest } from '@jest/globals'` is the global object. Kept on `vi` (one object
// per worker) rather than in this module, which can load more than once, and replaced
// for every file by the compat setup so a reassigned `jest.fn` never outlives its file.
const CURRENT = Symbol.for("vitest-native.jest-compat.jest");

/** Create this file's `jest` and make it the one `currentJestObject` returns. */
export function installJestObject(vi, members) {
  const jest = createJestObject(vi, members);
  Object.defineProperty(vi, CURRENT, { value: jest, configurable: true, writable: true });
  return jest;
}

/** The current file's `jest`, or a new one when the compat setup has not run. */
export function currentJestObject(vi) {
  return vi[CURRENT] ?? installJestObject(vi);
}

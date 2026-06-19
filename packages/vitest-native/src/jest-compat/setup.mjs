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

// Resolve modules from the consumer project root, not this file's location, so
// `jest.requireActual('some-project-dep')` resolves the same module the suite sees.
const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
const require = createRequire(path.join(projectRoot, "package.json"));

if (typeof vi.requireActual !== "function") vi.requireActual = (m) => require(m);
if (typeof vi.requireMock !== "function") vi.requireMock = (m) => require(m);
// `jest.setTimeout(ms)` has no global `vi` equivalent — no-op so suites that call
// it at top level don't crash.
if (typeof vi.setTimeout !== "function") vi.setTimeout = () => {};

// `jest.advanceTimersByTime(Async)` is lenient in Jest: when fake timers are NOT
// active it's effectively a no-op. Vitest's `vi.advanceTimersByTimeAsync` instead
// throws "timers are not mocked". RNTL's `userEvent.setup({ advanceTimers })`
// commonly receives this function and calls it even on suites that never enable
// fake timers — so the raw `jest = vi` alias breaks them. Guard the two advance
// methods to match Jest; everything else forwards to `vi` untouched.
const TIMER_GUARDS = {
  advanceTimersByTime: (...args) =>
    vi.isFakeTimers() ? vi.advanceTimersByTime(...args) : undefined,
  advanceTimersByTimeAsync: async (...args) =>
    vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(...args) : undefined,
};
globalThis.jest = new Proxy(vi, {
  get(target, prop, receiver) {
    if (Object.prototype.hasOwnProperty.call(TIMER_GUARDS, prop)) return TIMER_GUARDS[prop];
    return Reflect.get(target, prop, receiver);
  },
});

// jest.mock factories are wrapped by jestMockTransform to route their return
// value through Jest's CommonJS interop (so `import X from` sees the whole mock,
// and `() => Component` factories work). The wrapper calls this global.
if (typeof globalThis.__vnInteropMock !== "function") globalThis.__vnInteropMock = jestMockInterop;

// Jest test modules (and `jest.mock` factories) routinely call `require(...)`
// synchronously — e.g. `jest.mock('x', () => require('react-native').View)`. ESM
// test modules have no `require` binding, so provide a global one resolved from the
// project root. Guarded so it never clobbers an existing CJS `require`.
if (typeof globalThis.require !== "function") globalThis.require = require;

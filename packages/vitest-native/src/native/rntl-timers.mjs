// React Native Testing Library's fake-timer support, for RNTL's own files.
//
// RNTL drives fake timers only through a free `jest` identifier, in three files of
// every supported major (12.9, 13.3, 14.x):
//
//   helpers/timers.js          `typeof jest`, then `setTimeout._isMockFunction` (legacy)
//                              or `setTimeout.clock` + `jest.getRealSystemTime()`
//                              (modern) to decide whether fake timers are on; at load,
//                              `jest.useRealTimers()` / `jest.useFakeTimers(config)`
//                              around capturing the real setTimeout/setImmediate;
//   wait-for.js                `jest.advanceTimersByTime(interval)`, or
//                              `jest.advanceTimersByTimeAsync` (14, modern timers);
//   user-event/setup/setup.js  `jest.advanceTimersByTime(ms)` for its delays.
//
// With no `jest` in scope RNTL takes the real-timer path under `vi.useFakeTimers()`:
// `waitFor` and `findBy*` poll with a setInterval Vitest has faked, so the clock never
// moves and they time out. Vitest's fake timers are @sinonjs/fake-timers, as Jest's
// modern timers are, and set the same `setTimeout.clock` marker, so RNTL's modern
// detection needs only a `jest` that answers those five calls through `vi`.
//
// Those files get that `jest` as a function parameter around their compiled code, as
// Jest's module wrapper passes `jest` to every module. `globalThis.jest` is never
// touched: other code reads `typeof jest` to decide whether it runs under Jest. It is
// the same under jest-compat, whose global `jest` forwards these calls to `vi` too.
//
// Behaviour is RNTL's own under Jest, including two cases worth knowing:
//   - RNTL reads a mock-function `setTimeout` (`vi.spyOn(globalThis, "setTimeout")`)
//     as Jest's legacy fake timers, as it does under Jest, and `waitFor` then counts
//     its timeout in fake time.
//   - RNTL's helpers/timers.js, loaded while fake timers are on, switches to real
//     timers and back to capture the real ones; the round trip re-installs Vitest's
//     fake timers with the project's `fakeTimers` config, as Jest re-installs with its
//     own, so per-call options and pending fake timers do not survive it.
import Module from "node:module";

const RNTL_FILE =
  /[\\/]node_modules[\\/]@testing-library[\\/]react-native[\\/](?:build|dist)[\\/].+\.js$/;
// A free `jest`: `typeof jest`, or `jest.member` not reached through another object.
const USES_JEST = /\btypeof jest\b|(?<![\w$.])jest\.\w/;
// A harness global (`__vitest_native_*`), which the hot reset keeps across files.
const BRIDGE = "__vitest_native_rntl_jest";

/** The `jest` RNTL's files see: the five calls RNTL makes, answered by `vi`. */
export function createRntlJest(vi) {
  return Object.freeze({
    // RNTL passes `{ legacyFakeTimers }`; Vitest has one kind of fake timers.
    useFakeTimers() {
      vi.useFakeTimers();
    },
    useRealTimers() {
      vi.useRealTimers();
    },
    getRealSystemTime() {
      return vi.getRealSystemTime();
    },
    advanceTimersByTime(ms) {
      vi.advanceTimersByTime(ms);
    },
    async advanceTimersByTimeAsync(ms) {
      await vi.advanceTimersByTimeAsync(ms);
    },
  });
}

/** Whether `filename` is an RNTL file that reads a free `jest`. */
export function needsRntlJest(filename, content) {
  return (
    typeof filename === "string" &&
    typeof content === "string" &&
    RNTL_FILE.test(filename) &&
    USES_JEST.test(content)
  );
}

/**
 * `content` run with `jest` bound to the bridge. On its first line, so line numbers
 * stay; a parameter of an outer function, so RNTL's "use strict" prologue stays first
 * in the function its code runs in.
 */
export function withRntlJest(content) {
  const body = content.startsWith("#!") ? content.replace(/^#!.*/, "") : content;
  return (
    `(function (jest) {return (function () {${body}\n}).call(this);}).call(this, ` +
    `globalThis.${BRIDGE});`
  );
}

/**
 * Give RNTL's files a `jest` backed by `vi`. Once per worker: RNTL compiles once per
 * module registry, and its files must compile after this runs, so the setup file
 * installs it before any test file imports RNTL.
 */
export function installRntlJest(vi) {
  if (globalThis[BRIDGE]) return;
  Object.defineProperty(globalThis, BRIDGE, { value: createRntlJest(vi), configurable: true });
  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename, ...rest) {
    // `rest[0] === "module"` is Node compiling an ES module's source through the
    // CommonJS loader (require(esm)); its syntax cannot sit in a function body.
    if (rest[0] !== "module" && needsRntlJest(filename, content)) {
      return compile.call(this, withRntlJest(content), filename, ...rest);
    }
    return compile.call(this, content, filename, ...rest);
  };
}

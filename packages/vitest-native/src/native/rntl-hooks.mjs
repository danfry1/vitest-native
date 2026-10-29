// The RNTL adapter: what React Native Testing Library needs from its environment
// and does not get under Vitest, for each supported major (12, 13, 14). Two parts:
//   1. per-file hooks under the hot runtime (registerRntlHooksOnImport);
//   2. a `jest` for RNTL's fake-timer support (installRntlJest).
//
// --- 1. Per-file hooks ---
//
// RNTL's entry module registers its test hooks as a side effect of being evaluated:
// `afterEach` cleanup (unmount every rendered tree, reset `screen`) and the
// `beforeAll`/`afterAll` pair that turns React's act environment on for the file.
// Under per-file isolation a file that imports RNTL evaluates it, so it gets them, and
// a file that does not import RNTL does not. The hot runtime keeps RNTL resident — a
// fresh instance per file breaks its matchers against the resident renderer (see
// RUNTIME_RESIDENT_PACKAGES) — so the entry ran once, in the first file that imported
// it, and later files had no cleanup: `screen` still returned the previous file's
// tree, and its components stayed mounted with their effects.
//
// So the hooks are registered where RNTL would register them: when the file's graph
// imports RNTL's main entry. Vitest evaluates that externalized import through the
// module evaluator's runExternalModule once per file (the per-file reset clears the
// runner's evaluated flags). If the entry was already in Node's module cache before the
// import, it is resident and did not run, so its code is evaluated again outside the
// cache, against the resident instances it requires. Otherwise the import evaluated it
// and RNTL registered its own hooks. Consequences, each matching per-file isolation:
//   - a file that never imports RNTL gets no RNTL hooks and no act environment;
//   - `@testing-library/react-native/pure` never registers hooks;
//   - whichever copy of RNTL the file imports is the one re-run (monorepos, duplicates);
//   - an RNTL that Vite inlines registers itself and never passes through here.
// Two limits, both narrower than the leak this closes. An RNTL reached only through
// another Node-owned package, never imported by the file's own (Vite-owned) graph, is
// not seen here. And if such a package first loads RNTL during a file that also imports
// it directly, RNTL registers itself and the entry then re-runs, registering its hooks a
// second time in that one file — harmless, as cleanup is idempotent and the act
// environment pair restores in order.
//
// runExternalModule is Vitest's module-evaluator method in Vitest 4 and 5; if it goes
// away, nothing is wrapped and tests-native/hot-jest-compat fails on the RNTL surface.
import fs from "node:fs";
import Module from "node:module";
import { fileURLToPath } from "node:url";

const RNTL_ENTRY =
  /[\\/]node_modules[\\/]@testing-library[\\/]react-native[\\/](?:build|dist)[\\/]index\.js$/;
const WRAPPED = Symbol.for("vitest-native.rntl-hooks");

function residentEntry(id) {
  let file;
  try {
    file = id.startsWith("file://") ? fileURLToPath(id) : id.replace(/[?#].*$/, "");
  } catch {
    return null;
  }
  if (!RNTL_ENTRY.test(file)) return null;
  if (Module._cache[file]) return file;
  try {
    const real = fs.realpathSync(file);
    return Module._cache[real] ? real : null;
  } catch {
    return null;
  }
}

/**
 * Make `evaluator` re-register RNTL's per-file hooks whenever a file imports a
 * resident RNTL entry. Idempotent.
 */
export function registerRntlHooksOnImport(evaluator) {
  const run = evaluator?.runExternalModule;
  if (typeof run !== "function" || run[WRAPPED]) return;
  const wrapped = async function (id) {
    // Read before the import: afterwards the entry is always cached. A stubbed id
    // never loads the file, so it never re-runs it either.
    const stubbed = this?.stubs != null && typeof id === "string" && id in this.stubs;
    const resident = typeof id === "string" && !stubbed ? residentEntry(id) : null;
    const namespace = await run.call(this, id);
    if (resident) new Module(resident, null).load(resident);
    return namespace;
  };
  wrapped[WRAPPED] = true;
  evaluator.runExternalModule = wrapped;
}

// --- 2. RNTL's fake-timer `jest` ---
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

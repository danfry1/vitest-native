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
import vm from "node:vm";
import { noteRntlEntryImported, RNTL_ENTRY } from "../rntl-support.mjs";

const WRAPPED = Symbol.for("vitest-native.rntl-hooks");

function entryFile(id) {
  let file;
  try {
    file = id.startsWith("file://") ? fileURLToPath(id) : id.replace(/[?#].*$/, "");
  } catch {
    return null;
  }
  return RNTL_ENTRY.test(file) ? file : null;
}

// The key Node's module cache holds `file` under, if it is cached.
function cachedEntry(file) {
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
    const entry = typeof id === "string" && !stubbed ? entryFile(id) : null;
    const resident = entry ? cachedEntry(entry) : null;
    const namespace = await run.call(this, id);
    if (resident) new Module(resident, null).load(resident);
    // Without test.globals the entry registers no hooks, re-run or not. The setup file's
    // afterEach cleans up in its place and needs to know this file imported it (see
    // installRntlAutoCleanup in rntl-support.mjs); it calls the cached instance's cleanup,
    // which is the one the re-run's exports read through to.
    if (entry) {
      const cached = resident ?? cachedEntry(entry);
      if (cached) noteRntlEntryImported(cached);
    }
    return namespace;
  };
  wrapped[WRAPPED] = true;
  evaluator.runExternalModule = wrapped;
}

// --- 2. RNTL's fake-timer `jest` ---
//
// RNTL drives fake timers only through a free `jest` identifier. Every supported major
// (12.9, 13.3, 14.x) reads it in these three files, which its entry loads:
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
// 14.x also ships dist/test-utils/timers.js, RNTL's own test helper, which reads it too
// and gets the same `jest` if something loads it.
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
// Behaviour is RNTL's own under Jest, including three cases worth knowing:
//   - RNTL reads a mock-function `setTimeout` (`vi.spyOn(globalThis, "setTimeout")`)
//     as Jest's legacy fake timers, as it does under Jest, and `waitFor` then counts
//     its timeout in fake time. The advance calls are then made with real timers, so
//     they do nothing, as Jest's only warn: a throw would land inside RNTL's waitFor
//     Promise executor, which never settles, and `userEvent` would throw.
//   - RNTL's helpers/timers.js, loaded while fake timers are on (a setup file turned
//     them on), switches to real timers and back to capture the real ones. Without
//     the switch it would capture the fakes, and its cleanup and `waitFor` would
//     wait on a fake setImmediate forever. The round trip re-installs Vitest's fake
//     timers with the project's `fakeTimers` config, as Jest re-installs with its
//     own, so per-call options, the system time and pending fake timers do not
//     survive it.
//   - The hot runtime keeps RNTL loaded across files, so that round trip happens in
//     the first file that loads RNTL only. Per-file isolation repeats it in every
//     file, as Jest does.
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
    // A no-op with real timers, where Vitest would throw (see the top of this part).
    advanceTimersByTime(ms) {
      if (vi.isFakeTimers()) vi.advanceTimersByTime(ms);
    },
    async advanceTimersByTimeAsync(ms) {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(ms);
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
    return compile.call(this, rntlSource(content, filename, rest[0]), filename, ...rest);
  };
}

/**
 * The source Node compiles for `filename`: wrapped when it is an RNTL file that reads
 * a free `jest`, as it is otherwise. `format` is the one Node passes `_compile`.
 */
export function rntlSource(content, filename, format) {
  // `"module"` is Node compiling an ES module's source through the CommonJS loader
  // (require(esm)); its syntax cannot sit in a function body. A `.js` file whose format
  // Node has not decided (`null`) may still be ES module syntax, which Node detects
  // only once compiling it as CommonJS fails: such a file is left to Node as it is.
  if (format === "module" || !needsRntlJest(filename, content)) return content;
  const wrapped = withRntlJest(content);
  return parses(wrapped, filename) ? wrapped : content;
}

function parses(code, filename) {
  try {
    return new vm.Script(code, { filename }) instanceof vm.Script;
  } catch {
    return false;
  }
}

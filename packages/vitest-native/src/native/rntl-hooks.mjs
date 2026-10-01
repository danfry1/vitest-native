// React Native Testing Library's per-file hooks under the hot runtime.
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

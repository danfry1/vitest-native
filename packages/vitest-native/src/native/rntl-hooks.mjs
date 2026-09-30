// React Native Testing Library's per-file hooks under the hot runtime.
//
// RNTL's entry module registers its test hooks as a side effect of being evaluated:
// `afterEach` cleanup (unmount every rendered tree, reset `screen`) and the
// `beforeAll`/`afterAll` pair that turns React's act environment on for the file.
// Under per-file isolation it is evaluated once per file, so every file gets them.
// The hot runtime keeps RNTL resident — a fresh instance per file breaks its matchers
// against the resident renderer (see RUNTIME_RESIDENT_PACKAGES) — so the entry ran
// once, in the first file, and later files had no cleanup: `screen` still returned
// the previous file's tree, and its components stayed mounted with their effects.
//
// The fix re-runs only the entry module's code for each later file, against the
// resident instances it requires from the module cache. That reproduces RNTL's own
// registration exactly, for every RNTL version, without a second instance.
import Module, { createRequire } from "node:module";
import path from "node:path";

/**
 * RNTL's resolved entry file when a Node-owned RNTL is already loaded in this worker,
 * or null. Read at the file boundary, before any setup file runs, so an RNTL that a
 * setup file imports in the first file (and which registers its own hooks) is not
 * registered twice.
 */
export function residentRntlEntry(projectRoot) {
  let entry;
  try {
    entry = createRequire(path.join(projectRoot, "package.json")).resolve(
      "@testing-library/react-native",
    );
  } catch {
    return null;
  }
  return Module._cache[entry] ? entry : null;
}

/**
 * Evaluate RNTL's entry module again, outside the module cache, so it registers its
 * per-file hooks for the current test file. Its own requires resolve to the resident
 * instances.
 */
export function registerRntlHooks(entry) {
  const entryModule = new Module(entry, null);
  entryModule.load(entry);
}

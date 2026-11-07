// Resident health: state of the hot runtime's resident packages that the per-file
// reset cannot put back, and that would break every later file on the worker.
//
// The hot runtime keeps React, React Native and RNTL loaded across files and resets
// the realm around them (state-manifest.mjs). Some state lives inside those packages'
// module scope, where no reset can reach it. When a file leaves such state behind, the
// only safe answer is a fresh worker, so this module only DETECTS it; the pool decides.
// Each check reads what is already loaded and never loads a package itself: a check
// that imported React would create the resident instance it is meant to inspect.
//
// Callers:
//   - worker.mjs adds the problems to the response Vitest's worker sends when a task
//     ends (the message that already carries heap usage), and pool.ts's canReuse
//     retires a worker that reported any;
//   - runner.mjs adds the cause to a failed test that left a problem behind, and waits
//     at the next file's start for a problem that clears by itself when the worker
//     could not be retired (Vitest runs every file of a one-worker run as one task).
//
// A new check is one entry in CHECKS: a stable id, a reader that returns a message
// when the state is unusable (or null), and whether it can clear by itself.
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

// The key Node's module cache holds `file` under, if it is cached.
function cachedModule(file) {
  if (Module._cache[file]) return Module._cache[file];
  try {
    // Node's spelling (fs.realpathSync): the key Module._cache holds the file under.
    return Module._cache[fs.realpathSync(file)] ?? null;
  } catch {
    return null;
  }
}

const reactEntries = new Map();

function resolveOrNull(req, request) {
  try {
    return req.resolve(request);
  } catch {
    return null;
  }
}

// Every `react` entry the project could have loaded: the one the project resolves and
// the one React Native resolves (they differ when a monorepo holds two copies). Paths
// are resolved once per realm; resolving does not load anything.
function reactEntriesFor(projectRoot) {
  let entries = reactEntries.get(projectRoot);
  if (entries) return entries;
  const req = createRequire(path.join(projectRoot, "package.json"));
  const rnManifest = resolveOrNull(req, "react-native/package.json");
  const found = new Set([
    resolveOrNull(req, "react"),
    // A resolve hook may answer with a virtual id, which is not a place to resolve from.
    rnManifest && path.isAbsolute(rnManifest)
      ? resolveOrNull(createRequire(rnManifest), "react")
      : null,
  ]);
  found.delete(null);
  entries = [...found];
  reactEntries.set(projectRoot, entries);
  return entries;
}

// React's act queue: on the client internals in React 19 (`actQueue`), on
// `ReactCurrentActQueue.current` in React 18. Null while no act() scope is open.
function actQueueOf(react) {
  const internals = react?.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (internals && "actQueue" in internals) return internals.actQueue;
  return react?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.ReactCurrentActQueue?.current;
}

// Whether a loaded React has an act() scope open. A non-null queue alone does not say
// so: an act() whose callback throws or rejects closes its scope but leaves the queue
// non-null, and the next outermost act() flushes and clears it. So a non-null queue is
// settled with an empty synchronous act() first, which does exactly that when no scope
// is open (the work it flushes is what the next file's first render would flush) and
// leaves the queue alone inside an open scope. The act environment flag is set around
// it so React does not warn about the call.
function actScopeOpen(react) {
  if (actQueueOf(react) == null) return false;
  if (typeof react.act === "function") settleActQueue(react);
  return actQueueOf(react) != null;
}

function settleActQueue(react) {
  const flag = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    react.act(() => {});
    return true;
  } catch {
    // A production React has no act(); the queue is then read as it stands.
    return false;
  } finally {
    if (flag) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", flag);
    else delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

const CHECKS = [
  {
    // React counts open act() scopes in a module-private variable and holds a queue
    // (actQueue) while any is open. A scope that never closes, typically because a test
    // timed out while awaiting act(), makes every later render on the worker queue into
    // it and never commit: later files fail with "Unable to find an element".
    id: "react.act-scope",
    clearsOnItsOwn: true,
    read: (projectRoot) =>
      reactEntriesFor(projectRoot).some((entry) => actScopeOpen(cachedModule(entry)?.exports))
        ? "React's act() scope is still open"
        : null,
  },
];

/**
 * The resident state that would break later files on this worker, as
 * `{ id, message, clearsOnItsOwn }` entries; empty when the worker is reusable.
 */
export function residentProblems(projectRoot) {
  const problems = [];
  for (const check of CHECKS) {
    const message = check.read(projectRoot);
    if (message) problems.push({ id: check.id, message, clearsOnItsOwn: check.clearsOnItsOwn });
  }
  return problems;
}

/** One line naming every problem, for an error or a warning. */
export function describeProblems(problems) {
  return problems.map((problem) => `${problem.message} (${problem.id})`).join("; ");
}

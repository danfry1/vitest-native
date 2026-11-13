// One React for both module systems (#801). Vite dedupes React and its renderers
// (`resolve.dedupe` in native/apply.ts), so every file Vite loads gets one copy. Node
// resolved a request from wherever the requiring file sits, so a Node-owned package with
// its own nested copy of `react` (a shim such as use-sync-external-store, or a library
// that lists React as a dependency) loaded a second React, and its hooks ran against a
// dispatcher the renderer never set.
//
// Node now serves the names in REACT_DEDUPE from one anchor, the one the presets build
// their mocks with (preset-react.mjs, rendererRequire: where `react-native` resolves),
// through both of its resolvers: `require` (the `dedupe` resolve step) and `import`
// (loader.mjs, resolveBefore). The first deduped request of a project root holds the
// project and React Native Testing Library to that copy (assertOneReact,
// PRESET_REACT_MISMATCH), whether or not that request is redirected: Vite's dedupe
// resolves from the project, so a project whose React is not react-native's would
// otherwise get one copy in Vite and another in Node.
//
// What is not covered: a deep subpath the anchor cannot resolve (blocked by `exports`,
// or not installed where react-native resolves) keeps Node's own answer. With an isolated
// install (pnpm, bun) react-test-renderer and test-renderer are usually React Native
// Testing Library's and not visible from react-native's directory, so those two are
// deduped only where the anchor sees them.
import { nodeDispatch } from "../node-dispatch.mjs";
import { projectContext } from "../context.mjs";
import { assertOneReact, rendererRequire } from "../preset-react.mjs";

/** The packages served as one copy, by Vite and by Node. */
export const REACT_DEDUPE = Object.freeze([
  "react",
  "react-test-renderer",
  "test-renderer",
  "react-is",
]);

/** Whether a bare request names a deduped package or one of its subpaths. */
export function isDeduped(request) {
  return (
    typeof request === "string" &&
    REACT_DEDUPE.some((name) => request === name || request.startsWith(`${name}/`))
  );
}

// The anchor's own resolutions, and assertOneReact's, go back through Node's resolvers,
// and so through this module: they are answered by Node while this is set.
let anchoring = false;
// Per project root (a worker can serve more than one), then per request: a file, or null
// where the anchor cannot resolve it.
const anchors = new Map();

/** Run `fn` with this module's resolution switched off. */
function asNode(fn) {
  const outer = anchoring;
  anchoring = true;
  try {
    return fn();
  } finally {
    anchoring = outer;
  }
}

/**
 * The file the anchor resolves a deduped `request` to, for the project `root`, or null
 * when this module leaves the request to Node: not a deduped name, a resolution made on
 * this module's behalf, or one the anchor cannot answer. Every call holds the project to
 * the anchor's copy first (assertOneReact, which passes from its cache once a root has
 * passed, and fails again on every call for a root that does not).
 */
export function anchoredFile(request, root) {
  if (anchoring || !isDeduped(request)) return null;
  asNode(() => assertOneReact(root, "Node's dedupe serves"));
  let files = anchors.get(root);
  if (files === undefined) {
    files = new Map();
    anchors.set(root, files);
  }
  let file = files.get(request);
  if (file === undefined) {
    file = asNode(() => {
      try {
        return rendererRequire(root).resolve(request);
      } catch {
        // Not resolvable where the renderer resolves: Node's own answer stands.
        return null;
      }
    });
    files.set(request, file);
  }
  return file;
}

/** The project root a resolution belongs to: the running file's project, else `fallback`. */
function currentRoot(fallback) {
  return projectContext()?.projectRoot ?? fallback;
}

/**
 * Whether `require.resolve` options ask for something other than a plain require from
 * `parent`: explicit `paths` (a caller choosing where to look). Those are Node's to
 * answer, as the hooks step leaves them (hooks.mjs, onlyDefaultOptions).
 */
function explicitPaths(options, parent) {
  const paths = options?.paths;
  if (paths === undefined) return false;
  const own = parent?.paths;
  return !(
    Array.isArray(paths) &&
    Array.isArray(own) &&
    paths.length === own.length &&
    paths.every((entry, i) => entry === own[i])
  );
}

/**
 * Add the `require` side to Node's resolution, for `projectRoot` (the root this worker's
 * hooks were installed for; a resolution made while another project's file runs uses
 * that project's root). Once per worker.
 */
export function installReactDedupe(projectRoot, dispatch = nodeDispatch()) {
  dispatch.resolve.add(
    "dedupe",
    (next) =>
      function (request, parent, ...rest) {
        // The main module, and a caller choosing its own lookup paths, are Node's.
        if (rest[0] === true || explicitPaths(rest[1], parent)) {
          return next(request, parent, ...rest);
        }
        return anchoredFile(request, currentRoot(projectRoot)) ?? next(request, parent, ...rest);
      },
  );
}

/** For tests: forget every anchor. */
export function resetReactDedupe() {
  anchors.clear();
}

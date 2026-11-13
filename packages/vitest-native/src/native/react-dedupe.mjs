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
// (loader.mjs, resolveBefore). Only where a request resolves from changes: which build
// of a dual package it gets is still that resolver's rule, the one the test's own import
// follows (test-renderer: `import` → dist/index.js, as Vitest's externals load it;
// under an ownership model the shared resolver's answer, `require`'s dist/index.cjs). Files
// are served in Vite's spelling (realpathSync.native), the one its externals reach Node
// in: on a case-insensitive disk or a Windows 8.3 root, Node's own spelling of the same
// file is a different module. The first deduped request of a project root holds the
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
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { nodeDispatch } from "../node-dispatch.mjs";
import { projectContext } from "../context.mjs";
import { assertOneReact } from "../preset-react.mjs";

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
// Per project root (a worker can serve more than one): the file the anchor resolves
// from, and the `require` answers it gave (a file, or null where it has none).
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

/** A file in Vite's spelling (realpathSync.native), or as given when it is not on disk. */
export function inViteSpelling(file) {
  try {
    return fs.realpathSync.native(file);
  } catch {
    return file;
  }
}

/**
 * The anchor for `root`: react-native's package.json where it resolves from the project,
 * else the project's own (preset-react.mjs, rendererRequire), in Vite's spelling.
 */
function anchorOf(root) {
  let anchor = anchors.get(root);
  if (anchor === undefined) {
    const own = path.join(root, "package.json");
    const base = asNode(() => {
      try {
        return createRequire(own).resolve("react-native/package.json");
      } catch {
        return own;
      }
    });
    // A resolver hook can answer with a virtual id (the mock engine's react-native).
    anchor = { base: inViteSpelling(path.isAbsolute(base) ? base : own), files: new Map() };
    anchors.set(root, anchor);
  }
  return anchor;
}

/**
 * The anchor `request` resolves from for the project `root`, or null when this module
 * leaves the request to Node: not a deduped name, or a resolution made on this module's
 * behalf. Holds the project to the anchor's copy first (assertOneReact: once per root,
 * a failed root failing again on every call).
 */
function anchorFor(request, root) {
  if (anchoring || !isDeduped(request)) return null;
  asNode(() => assertOneReact(root, "Node's dedupe serves"));
  return anchorOf(root);
}

/**
 * The file `require` gets for a deduped `request` in the project `root`: the anchor's
 * answer, in Vite's spelling. Null when anchorFor leaves it to Node, or the anchor cannot
 * resolve it.
 */
export function anchoredFile(request, root) {
  const anchor = anchorFor(request, root);
  if (anchor === null) return null;
  let file = anchor.files.get(request);
  if (file === undefined) {
    file = asNode(() => {
      try {
        return inViteSpelling(createRequire(anchor.base).resolve(request));
      } catch {
        // Not resolvable where the renderer resolves: Node's own answer stands.
        return null;
      }
    });
    anchor.files.set(request, file);
  }
  return file;
}

/**
 * The parent URL an `import` of a deduped `request` resolves from in the project `root`
 * (loader.mjs resolves it there with the import's own conditions), or null when anchorFor
 * leaves it to Node.
 */
export function anchoredImportParent(request, root) {
  const anchor = anchorFor(request, root);
  return anchor === null ? null : pathToFileURL(anchor.base).href;
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

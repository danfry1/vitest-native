// One React for both module systems (#791 follow-up). Vite dedupes React and its
// renderers (`resolve.dedupe` in native/apply.ts), so every file Vite loads gets one copy.
// Node resolves a request from wherever the requiring file sits, so a Node-owned package
// with its own nested copy of `react` (a shim such as use-sync-external-store, or any
// library that declares React as a dependency) loaded a second React: its hooks then
// ran against a dispatcher the renderer never set.
//
// Node now applies the same list from the same anchor the presets build their mocks with
// (preset-react.mjs, rendererRequire: where `react-native` resolves). Where Node's own
// answer is already the anchor's, nothing changes. Where it differs, the anchor's copy is
// served, and the project and React Native Testing Library are held to the same copy
// (assertOneReact, PRESET_REACT_MISMATCH).
import { nodeDispatch } from "../node-dispatch.mjs";
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
  return REACT_DEDUPE.some((name) => request === name || request.startsWith(`${name}/`));
}

/**
 * Add the dedupe step to Node's resolution, anchored at `projectRoot`. Once per worker.
 */
export function installReactDedupe(projectRoot, dispatch = nodeDispatch()) {
  // The anchor's own resolution re-enters Node's resolver, and so this step.
  let anchoring = false;
  const anchored = new Map();
  dispatch.resolve.add(
    "dedupe",
    (next) =>
      function (request, parent, ...rest) {
        const own = next(request, parent, ...rest);
        if (anchoring || typeof request !== "string" || rest[0] === true || !isDeduped(request)) {
          return own;
        }
        let file = anchored.get(request);
        if (file === undefined) {
          anchoring = true;
          try {
            file = rendererRequire(projectRoot).resolve(request);
          } catch {
            // Not installed where the renderer resolves: Node's own answer stands.
            file = null;
          } finally {
            anchoring = false;
          }
          anchored.set(request, file);
        }
        if (file === null || file === own) return own;
        assertOneReact(projectRoot, "Node's dedupe serves");
        return file;
      },
  );
}

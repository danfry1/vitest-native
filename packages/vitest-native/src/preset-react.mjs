import { createRequire } from "node:module";
import path from "node:path";
import { docsUrl } from "./docs-url.mjs";
import { VitestNativeError } from "./errors.mjs";

/**
 * The context a preset module's factory builds its mock with: the React the test renders
 * with, which is the copy `react-native` resolves (its components and the test renderer
 * must share one React for hooks and contexts to work). Not the copy beside the shadowed
 * package: the preset replaces that package's code, so a React it nests is never used.
 * Where `react-native` is not installed (the mock engine can run without it), the
 * project's React.
 *
 * Required when the mock is built, in the file that imports it, and not imported by the
 * presets themselves: vitest-native's presets load once per worker, and under the hot
 * runtime's freshRuntime each file has its own React (#719). Elsewhere this is the one
 * React the worker keeps.
 *
 * With `check`, it also fails when the project or React Native Testing Library resolves
 * another copy of React: a mock built with one copy fails in a tree another renders, and
 * a copy that never renders cannot tell a hook call inside a render from one outside it.
 */
export function presetFactoryContext(pkg, root, { check = false } = {}) {
  const fromRoot = createRequire(path.join(root, "package.json"));
  const fromRenderer = requireFrom(fromRoot, "react-native/package.json");
  if (check) checkOneReact(pkg, fromRoot, fromRenderer);
  return { React: fromRenderer("react") };
}

/** A require from the file `fromRoot` resolves `request` to, or `fromRoot` where there is none. */
function requireFrom(fromRoot, request) {
  let file;
  try {
    file = fromRoot.resolve(request);
  } catch {
    return fromRoot;
  }
  // A resolver hook can answer with a virtual module id rather than throw (the mock
  // engine serves react-native itself): only a file on disk anchors a require.
  return path.isAbsolute(file) ? createRequire(file) : fromRoot;
}

function checkOneReact(pkg, fromRoot, fromRenderer) {
  const react = fromRenderer.resolve("react");
  const others = [["the project", fromRoot]];
  const rntl = requireFrom(fromRoot, "@testing-library/react-native/package.json");
  if (rntl !== fromRoot) others.push(["@testing-library/react-native", rntl]);
  for (const [who, from] of others) {
    const theirs = from.resolve("react");
    if (theirs !== react) {
      throw new VitestNativeError(
        "PRESET_REACT_MISMATCH",
        `the ${pkg} preset builds its mock with the React react-native uses (${react}), ` +
          `but ${who} resolves another copy (${theirs}). Hooks and contexts from one copy ` +
          `fail in a tree the other renders. Install one copy of react: dedupe it in the ` +
          `workspace, or align the versions the packages ask for.`,
        { docs: docsUrl("/guide/errors#PRESET_REACT_MISMATCH") },
      );
    }
  }
}

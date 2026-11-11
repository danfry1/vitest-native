import { createRequire } from "node:module";
import path from "node:path";

/**
 * The context a preset module's factory builds its mock with, for the shadowed package
 * `pkg`: the React the test file renders with, required from the package's directory (in
 * a monorepo, the React that package would import), else from the project root.
 *
 * Required when the mock is built, in the file that imports it, and not imported by the
 * presets themselves: vitest-native's presets load once per worker, and under the hot
 * runtime's freshRuntime each file has its own React (#719). Elsewhere this is the one
 * React the worker keeps.
 */
export function presetFactoryContext(pkg, root) {
  return { React: requireBeside(pkg, root)("react") };
}

/** A require from `pkg`'s directory, or from the project root where `pkg` is not there. */
function requireBeside(pkg, root) {
  const fromRoot = createRequire(path.join(root, "package.json"));
  try {
    return createRequire(fromRoot.resolve(pkg));
  } catch {
    // Not resolvable by require (an ESM-only package): the project's React.
    return fromRoot;
  }
}

// The Jest resolvers React Native libraries ship for their own test runs.
//
// react-native-worklets and react-native-reanimated publish `jest/resolver.js`, which a
// Jest suite names as its `resolver`: for their own files (worklets' every file, and a
// listed set of reanimated's), it resolves without the `.native` extensions, so the
// JS implementations load instead of the ones that call into native code. Without it
// their own mocks fail to load under Jest as well (reanimated's mock imports the real
// package, whose native initializer throws). The engine asks these resolvers which
// extensions a request is resolved with and resolves it itself, so the libraries keep
// deciding which of their files that applies to.
import { createRequire } from "node:module";
import path from "node:path";

// Reanimated's resolver applies worklets' for everything it does not handle itself.
const RESOLVERS = ["react-native-reanimated/jest/resolver", "react-native-worklets/jest/resolver"];

const loaded = new Map();
const CAPTURED = Symbol("captured");

/** The first installed library resolver, from `projectRoot`, or null. */
function resolverFor(projectRoot) {
  if (loaded.has(projectRoot)) return loaded.get(projectRoot);
  let found = null;
  const req = createRequire(path.join(projectRoot, "package.json"));
  for (const id of RESOLVERS) {
    try {
      // By resolved path: by name, a preset shadowing the package would answer it.
      found = req(req.resolve(id));
      if (typeof found === "function") break;
      found = null;
    } catch {
      // Not installed, or not this version's layout.
    }
  }
  loaded.set(projectRoot, found);
  return found;
}

/**
 * The extensions a library's own Jest resolver resolves `request` from `fromFile`
 * with, when it narrows `extensions`; else null, for the engine's own resolution.
 */
export function libraryExtensionsFor(projectRoot, request, fromFile, extensions) {
  const resolver = resolverFor(projectRoot);
  if (!resolver) return null;
  let captured = null;
  try {
    const result = resolver(request, {
      basedir: path.dirname(fromFile),
      extensions,
      defaultResolver: (_request, options) => {
        captured = options?.extensions ?? extensions;
        return CAPTURED;
      },
    });
    if (result !== CAPTURED || !captured) return null;
  } catch {
    return null;
  }
  return captured.length === extensions.length ? null : captured;
}

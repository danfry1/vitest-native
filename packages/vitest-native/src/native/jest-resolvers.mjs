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
import { owningPackageOfFile } from "./match.mjs";

// Reanimated's resolver applies worklets' for everything it does not handle itself.
const RESOLVERS = ["react-native-reanimated/jest/resolver", "react-native-worklets/jest/resolver"];

// The packages whose own files these resolvers decide for. The resolvers tell their
// files apart by substring (`options.basedir.includes('react-native-worklets')`), which
// also matches a package that merely sits beside them: pnpm names a package's store
// directory after its peers (`.pnpm/expo-modules-core@58_react-native-worklets@0.13/…`),
// and `react-native-worklets-core` is a different package. So they are consulted only
// for files these packages own, and see each file at its package-relative path.
const OWNERS = new Set(["react-native-reanimated", "react-native-worklets"]);

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
  const owner = owningPackageOfFile(fromFile);
  if (!owner || !OWNERS.has(owner)) return null;
  const resolver = resolverFor(projectRoot);
  if (!resolver) return null;
  // The directory from the owning package on (`node_modules/<pkg>/…`), without the
  // store path before it. Only the resolver's substring checks read it: the engine
  // resolves the request itself, from the real directory.
  const posixDir = path.dirname(fromFile).split(path.sep).join("/");
  const basedir = posixDir.slice(posixDir.lastIndexOf("/node_modules/"));
  let captured = null;
  try {
    const result = resolver(request, {
      basedir,
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

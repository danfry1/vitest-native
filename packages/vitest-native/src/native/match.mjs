/**
 * Which files belong to which package — the one place that decides it.
 *
 * The native engine splits the module graph between Vite and Node (the rule itself is
 * written down in the header of apply.ts). Four places used to answer "does this file
 * belong to a Node-owned package?" independently: the externalization patterns handed
 * to Vitest, auto-detection, and the transform matchers in the require hook and the
 * ESM loader. They agreed by construction rather than by structure, and three of the
 * defects in this area were one of them disagreeing with the others — a directory
 * anchor the transform side applied and the config side did not, a `node_modules`
 * rule that also matched any folder sharing a package's name, and a separator
 * mismatch that only appeared on Windows.
 *
 * Vitest's `server.deps.external` takes patterns rather than a predicate, so config
 * time and run time cannot literally call the same function. They can be generated
 * from the same rules, which is what `packagePatterns` is for: `buildPkgMatcher`
 * tests exactly the patterns that were handed to Vitest.
 *
 * Everything here is pure. apply.ts bundles a copy into the plugin entry while the
 * worker loads this file directly, so it must stay that way — module-level state
 * would exist twice.
 */
import { createRequire } from "node:module";
import path from "node:path";

/** Any file under a node_modules directory. */
export const NODE_MODULES_PATH = /[\\/]node_modules[\\/]/;

/**
 * React Native's own source, including the `@react-native/*` packages. Node owns
 * these unconditionally: the Flow strip, the boundary mocks and the precompiled
 * registry are all Node loader hooks.
 */
export const REACT_NATIVE_PATH = /[\\/]node_modules[\\/](react-native|@react-native)[\\/]/;

/** Escape a string for literal use inside a RegExp. */
function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Forward slashes, the form Vitest presents module ids in. */
function toPosix(value) {
  return value.replace(/\\/g, "/");
}

/**
 * Does `dir` contain `target` (or equal it)?
 *
 * Used to recognise the package the run lives in. A package directory containing the
 * Vitest root is the project, not a dependency of it — externalizing it hands Vitest
 * its own source and test files back through Node, where they are compiled to
 * CommonJS.
 *
 * Compared case-insensitively on Windows: `require.resolve` reports the on-disk
 * casing while a working directory carries whatever the shell supplied, and a
 * drive-letter difference alone would silently defeat the check.
 */
export function containsPath(dir, target) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const outer = normalize(dir);
  const inner = normalize(target);
  return inner === outer || inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);
}

/**
 * The on-disk directory a package resolves to, or null.
 *
 * `pkg/package.json` is tried first because it names the package root exactly; some
 * packages do not export it, so fall back to resolving the entry and walking up to
 * the manifest that names them. Symlinked and workspace packages resolve to their
 * real location, which is the whole point — see buildPkgMatcher.
 */
function packageDirOf(name, projectRoot) {
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    return path.dirname(req.resolve(`${name}/package.json`));
  } catch {}
  let dir;
  try {
    dir = path.dirname(req.resolve(name));
  } catch {
    return null;
  }
  for (;;) {
    try {
      if (createRequire(path.join(dir, "index.js"))("./package.json").name === name) return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The patterns identifying one package's files. THE rule; everything else composes it.
 *
 * A bare `[/\]name[/\]` test — what this used to be — also matches any DIRECTORY
 * that happens to share a package's name. A project folder called `expo`, or a source
 * directory named after the library it implements, made every file beneath it look
 * like third-party source to be compiled. That mis-compiled unrelated files, this
 * package's own runtime among them.
 *
 * Anchoring on `node_modules` alone would fix that and break linked packages: a
 * workspace or `file:` dependency resolves to its real path, which has no
 * `node_modules` segment at all. So a file matches if it is either
 *
 *   - under `node_modules/<name>/` (covers additional copies of a package that a
 *     single resolution cannot see, and projects where resolution fails), or
 *   - inside the package's resolved directory (exact; covers workspace links, and
 *     stores like pnpm's and bun's).
 *
 * The resolved-directory anchor is dropped when that directory CONTAINS the project
 * root, because then it is the project. Externalizing the project hands Vitest its
 * own source and test files back through Node, which compiles them to CommonJS: a
 * test file's `import { it } from 'vitest'` becomes `require('vitest')` and throws.
 *
 * `projectRoot` is optional; without it only the `node_modules` rule applies, since
 * there is nothing to resolve against.
 */
export function packagePatterns(name, projectRoot) {
  const patterns = [new RegExp(`[\\\\/]node_modules[\\\\/]${escapeRe(name)}[\\\\/]`)];
  if (!projectRoot) return patterns;
  const dir = packageDirOf(name, projectRoot);
  if (dir && !containsPath(dir, projectRoot)) {
    patterns.push(new RegExp(`^${escapeRe(toPosix(dir).replace(/\/$/, ""))}[\\\\/]`));
  }
  return patterns;
}

/**
 * A predicate over the same patterns Vitest is given, so what the loader transforms
 * and what Vitest externalizes cannot drift apart.
 *
 * Paths are normalised before testing: the directory anchor is written with forward
 * slashes (the form Vitest presents module ids in) while callers here pass whatever
 * Node handed them, which on Windows is backslashes.
 */
export function buildPkgMatcher(pkgs, projectRoot) {
  const patterns = (pkgs || []).flatMap((name) => packagePatterns(name, projectRoot));
  return (file) => {
    const norm = toPosix(file);
    return patterns.some((re) => re.test(norm));
  };
}

// The bare package name of an import specifier ("@scope/pkg/sub" → "@scope/pkg",
// "pkg/sub" → "pkg"). Relative/absolute specifiers yield strings that can never
// collide with a package name, so callers only need an equality check.
export function packageNameOf(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

// The leaf module name a subpath import points at ("pkg/lib/Swipeable" or
// "pkg/Swipeable.ios.js" → "Swipeable"), used to pick the matching export off a
// preset/RN mock. Returns null when there is no usable leaf (trailing slash).
export function subpathLeafOf(specifier) {
  const base = specifier.split("/").pop();
  if (!base) return null;
  return base.split(".")[0] || null;
}

// Deep entries of preset packages that are deliberately Node-safe and must NOT
// be shadowed by the preset mock: test utilities and tooling entry points
// (react-native-gesture-handler/jest-utils, react-native-reanimated/mock,
// */jestSetup, babel `*/plugin` entries). They are designed to run under a
// Node test runner, and shadowing them replaces working code with undefined
// exports.
const UTILITY_SUBPATH_LEAVES = new Set(["jest-utils", "jestSetup", "mock", "plugin"]);

export function isUtilitySubpath(specifier) {
  const leaf = subpathLeafOf(specifier);
  return leaf !== null && UTILITY_SUBPATH_LEAVES.has(leaf);
}

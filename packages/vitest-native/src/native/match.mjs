import { createRequire } from "node:module";
import path from "node:path";

/** Escape a string for literal use inside a RegExp. */
function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
 * Builds a predicate matching files that belong to any of the given packages.
 *
 * A bare `[/\]name[/\]` test — what this used to do — also matches any DIRECTORY
 * that happens to share a package's name. A project folder called `expo`, or a source
 * directory named after the library it implements, made every file beneath it look
 * like third-party source to be compiled. That mis-compiled unrelated files, this
 * package's own runtime among them.
 *
 * Anchoring on `node_modules` alone would fix that and break linked packages: a
 * workspace or `file:` dependency resolves to its real path, which has no
 * `node_modules` segment at all. So a file matches if it is either
 *
 *   - inside the package's resolved directory (exact; covers workspace links, and
 *     stores like pnpm's and bun's), or
 *   - under `node_modules/<name>/` (covers additional copies of a package that the
 *     single resolution above cannot see, and projects where resolution fails).
 *
 * `projectRoot` is optional so existing callers keep working; without it only the
 * `node_modules`-anchored rule applies.
 */
export function buildPkgMatcher(pkgs, projectRoot) {
  const names = pkgs || [];
  const anchored = names.map((p) => new RegExp(`[\\\\/]node_modules[\\\\/]${escapeRe(p)}[\\\\/]`));
  const dirs = [];
  if (projectRoot) {
    for (const name of names) {
      const dir = packageDirOf(name, projectRoot);
      if (dir) dirs.push(dir.replace(/\\/g, "/").replace(/\/$/, "") + "/");
    }
  }
  return (normPath) => {
    if (anchored.some((re) => re.test(normPath))) return true;
    if (dirs.length === 0) return false;
    const norm = normPath.replace(/\\/g, "/");
    return dirs.some((dir) => norm.startsWith(dir));
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

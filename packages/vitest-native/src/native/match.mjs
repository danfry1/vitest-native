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
import fs from "node:fs";
import path from "node:path";

/** Any file under a node_modules directory. */
export const NODE_MODULES_PATH = /[\\/]node_modules[\\/]/;

/**
 * React Native's own source, including the `@react-native/*` packages. Node owns
 * these unconditionally: the Flow strip, the boundary mocks and the precompiled
 * registry are all Node loader hooks.
 */
export const REACT_NATIVE_PATH = /[\\/]node_modules[\\/](react-native|@react-native)[\\/]/;

/**
 * A directory in the form Node's module loader reports paths: fs.realpathSync, not
 * realpathSync.native. The native call expands Windows 8.3 short names (RUNNER~1) and
 * rewrites letter case on case-insensitive disks, so a directory it returns can fail
 * to contain the module ids Node hands the matchers.
 */
function canonicalDir(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

/**
 * Resolve only from a physical node_modules directory at/above the project.
 *
 * Unlike createRequire.resolve(), this deliberately ignores NODE_PATH and loader
 * hooks. It is for dependencies whose presence must be consumer-visible rather than
 * borrowed from the test runner's own install.
 */
export function installedPackageDirOf(name, projectRoot) {
  const packagePath = name.split("/");
  let dir = path.resolve(projectRoot);
  for (;;) {
    const candidate = path.join(dir, "node_modules", ...packagePath);
    if (fs.existsSync(path.join(candidate, "package.json"))) return canonicalDir(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

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
export function packageDirOf(name, projectRoot) {
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    return canonicalDir(path.dirname(req.resolve(`${name}/package.json`)));
  } catch {}
  let dir;
  try {
    dir = path.dirname(req.resolve(name));
  } catch {
    return null;
  }
  for (;;) {
    try {
      if (createRequire(path.join(dir, "index.js"))("./package.json").name === name) {
        return canonicalDir(dir);
      }
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

// The preset package a RESOLVED file belongs to, when the import that reached it came
// from outside that package: `{ pkg, subpath }` ("…/node_modules/expo-asset/build/
// index.js" → { pkg: "expo-asset", subpath: "build/index.js" }), else null.
//
// Node's ESM loader only sees bare names for `import`. A CommonJS module that the
// loader compiled and returned with its source (every `.ts` package, such as `expo`)
// runs with the loader's own `require`, which resolves the request through
// `Module._resolveFilename` first and passes the hooks a file URL — so a bare-name
// redirect never matches and the real native package loads. Files a preset package
// loads from itself are its own internals and stay as they are (only reachable once
// the real entry already loaded).
export function presetPackageOfFile(file, parentFile, isPresetPackage) {
  const norm = toPosix(file);
  const marker = "/node_modules/";
  const at = norm.lastIndexOf(marker);
  if (at === -1) return null;
  const rest = norm.slice(at + marker.length);
  const pkg = packageNameOf(rest);
  if (pkg === rest || !isPresetPackage(pkg)) return null;
  const pkgDir = norm.slice(0, at + marker.length) + pkg + "/";
  if (parentFile && toPosix(parentFile).startsWith(pkgDir)) return null;
  return { pkg, subpath: rest.slice(pkg.length + 1) };
}

const stripDot = (p) => p.replace(/^\.\//, "");
const stripExt = (p) => p.replace(/\.(?:[cm]?[jt]sx?|json)$/, "");

/** The value every `*` in `target` stands for when it matches `subpath`, or null. */
function patternMatch(target, subpath) {
  const parts = target.split("*");
  if (parts.length < 2) return null;
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The first `*` captures; every later one must repeat it.
  const source = parts
    .map((part, i) => (i === 0 ? "" : i === 1 ? "(.+?)" : "\\1") + escape(part))
    .join("");
  const match = new RegExp(`^${source}$`).exec(subpath);
  return match ? match[1] : null;
}

/** Every file target in an `exports` value, whatever its condition nesting. */
function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value && typeof value === "object") return Object.values(value).flatMap(exportTargets);
  return [];
}

/**
 * The request that reached a file inside a package, recovered from the package's own
 * manifest when only the resolved file is known (see presetPackageOfFile): the
 * `exports` subpath that serves it (`./jest-utils` → "pkg/jest-utils", `.` → "pkg"),
 * else the package itself for its `main`/`module`/`react-native` entry, else the
 * subpath with `index` files read as their directory, as Node and Metro resolve them.
 * The redirect's exemptions (utility entries such as `plugin`, `mock`, `jest-utils`)
 * then apply to the request a caller actually wrote, not to a file name like `index`.
 */
export function requestForPackageFile(pkg, subpath, manifest) {
  const sub = toPosix(subpath);
  const exportsField = manifest?.exports;
  if (exportsField && typeof exportsField === "object" && !Array.isArray(exportsField)) {
    const keyed = Object.keys(exportsField).some((k) => k.startsWith("."));
    const entries = keyed ? Object.entries(exportsField) : [[".", exportsField]];
    for (const [key, value] of entries) {
      for (const target of exportTargets(value)) {
        const t = stripDot(target);
        if (!key.includes("*")) {
          if (t === sub) return key === "." ? pkg : `${pkg}/${stripDot(key)}`;
          continue;
        }
        // Subpath pattern ("./*": "./dist/*.js"). Node allows one `*` in the key and
        // replaces every `*` in the target with the same match, so the target's stars
        // are one captured value.
        const star = patternMatch(t, sub);
        if (star !== null) return `${pkg}/${stripDot(key).split("*").join(star)}`;
      }
    }
  } else if (typeof exportsField === "string" && stripDot(exportsField) === sub) {
    return pkg;
  }
  for (const field of ["react-native", "module", "main"]) {
    const entry = manifest?.[field];
    if (typeof entry === "string" && stripExt(stripDot(entry)) === stripExt(sub)) return pkg;
  }
  if (!manifest?.main && /^index\.[cm]?[jt]sx?$/.test(sub)) return pkg;
  const withoutIndex = sub.replace(/\/index\.[cm]?[jt]sx?$/, "");
  return `${pkg}/${withoutIndex === sub ? stripExt(sub) : withoutIndex}`;
}

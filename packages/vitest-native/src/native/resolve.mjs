// Metro-style platform-extension resolution: prefer the configured platform,
// then .native, then generic TS/JS variants, and fall back to a directory index.
// Shared by the require hook and the loader.
import fs from "node:fs";
import path from "node:path";

/**
 * Metro's default `sourceExts`, in its order. Kept as data rather than spelled out
 * per platform so the Vite graph and the Node graph cannot drift apart — both build
 * their list from this one array (see `getPlatformExtensions` in ../resolve.ts).
 *
 * The order is load-bearing where a module has more than one variant on disk:
 * Metro picks `Foo.js` over `Foo.tsx`, so this list must too, or a project with a
 * compiled file beside its source tests a different file than it ships. `json` is
 * a source extension to Metro, which is why `import config from './config'`
 * resolves `config.json` in an app.
 */
export const METRO_SOURCE_EXTS = ["js", "jsx", "json", "ts", "tsx"];

/**
 * Extension-MAJOR, exactly as Metro resolves: for each source extension in order,
 * try the platform variant, then `.native`, then bare — `.ios.js`, `.native.js`,
 * `.js`, `.ios.jsx`, … (metro-resolver's `resolveSourceFile` loops `sourceExts`
 * in the outer loop and the platform variants inside it).
 *
 * This order previously interleaved the other way — every `.ios.*` before any
 * `.native.*` before any bare extension — and the difference is not stylistic:
 * a module shipping `Foo.native.js` beside `Foo.ios.tsx` resolves to
 * `.native.js` under Metro (the `js` round wins before `tsx` is ever tried) but
 * resolved to `.ios.tsx` here, so the test ran a different file than the app
 * ships. The order is asserted against real metro-resolver by
 * tests/metro-resolver-oracle.test.ts, not just against these literals.
 */
export function extensionsFor(platform, sourceExts = METRO_SOURCE_EXTS) {
  const suffix = platform === "android" ? "android" : "ios";
  const exts = [];
  for (const e of sourceExts) {
    exts.push(`.${suffix}.${e}`, `.native.${e}`, `.${e}`);
  }
  return exts;
}

/**
 * Whether `file` exists under exactly this name.
 *
 * macOS and Windows disks are case-insensitive by default, so `fs.existsSync("App.json")`
 * is true when only `app.json` exists. Resolving `./App` in extension order (Metro's: js,
 * jsx, json, ts, tsx) then picks the React Native template's `app.json` over its `App.tsx`,
 * and the template's own test renders `{ name, displayName }`. Metro resolves from a
 * case-sensitive file map, as does Linux, which is why neither Metro nor CI saw it. The
 * directory listing has the real names. Checked for the file's own name: the case the
 * template hits, and one `readdir` per hit, which the resolution caches absorb.
 */
export function existsExact(file) {
  if (!fs.existsSync(file)) return false;
  try {
    return fs.readdirSync(path.dirname(file)).includes(path.basename(file));
  } catch {
    return true; // An unreadable directory keeps the filesystem's verdict.
  }
}

// Per-worker cache: platform + ordered sourceExts + absolute base → path | null.
// Platform resolution is deterministic for a given on-disk layout, and Node's own
// module cache already dedupes most re-resolution; this dedupes the rest (distinct
// import edges resolving to the same base), so each base is scanned at most once per
// worker instead of running up to ~24 `existsSync` calls every time. Negative
// results are cached too. Lifetime is the worker process — like Vite's own
// resolution cache, a newly-added platform variant is picked up on the next restart.
const resolveCache = new Map();

/**
 * Given an absolute base path with no extension (e.g. ".../Foo"), return the
 * first existing platform variant (".../Foo.ios.tsx", etc.) or directory index,
 * or null if none exist.
 */
export function resolvePlatformFile(absBase, platform = "ios", sourceExts = METRO_SOURCE_EXTS) {
  const key = platform + "\0" + sourceExts.join("\0") + "\0" + absBase;
  const cached = resolveCache.get(key);
  if (cached !== undefined) return cached;
  const resolved = scanPlatformFile(absBase, platform, sourceExts);
  resolveCache.set(key, resolved);
  return resolved;
}

function scanPlatformFile(absBase, platform, sourceExts) {
  const extensions = extensionsFor(platform, sourceExts);
  for (const ext of extensions) {
    if (existsExact(absBase + ext)) return absBase + ext;
  }
  for (const ext of extensions) {
    const idx = path.join(absBase, "index" + ext);
    if (existsExact(idx)) return idx;
  }
  return null;
}

/**
 * Resolve a deep package specifier by PATH when Node's exports-map enforcement
 * rejects it.
 *
 * React Native 0.87 ships an `exports` map whose deep-import surface is gated
 * behind Metro's `react-native-legacy-deep-imports` condition — and the 0.87
 * Babel preset compiles RN's own relative imports into bare deep specifiers
 * (`react-native/src/private/…`), so RN's compiled graph self-references through
 * paths plain Node now refuses (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Metro resolves
 * them; this engine mirrors Metro: locate the package directory by walking
 * node_modules from the requiring file and resolve the file directly, platform
 * extensions included — path resolution is not subject to exports maps.
 *
 * Scoped to react-native and @react-native/* — the packages whose graphs the
 * preset rewrites. Ordinary packages keep Node's exports enforcement.
 */
export function resolveDeepPackageFile(request, fromDir, platform, sourceExts = METRO_SOURCE_EXTS) {
  const m = /^(react-native|@react-native\/[^/]+)\/(.+)$/.exec(request);
  if (!m) return null;
  const [, pkg, rest] = m;
  const pkgDir = findPackageDir(fromDir, pkg);
  if (!pkgDir) return null;
  const base = path.join(pkgDir, rest);
  try {
    if (fs.statSync(base).isFile()) return base;
  } catch {}
  // `Foo.js` may exist only as a platform variant, and extensionless specifiers
  // need the full Metro candidate list either way.
  const stem = /\.[a-z0-9]+$/i.test(base) ? base.replace(/\.js$/, "") : base;
  return resolvePlatformFile(stem, platform, sourceExts);
}

function findPackageDir(startDir, pkg) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, "node_modules", ...pkg.split("/"));
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

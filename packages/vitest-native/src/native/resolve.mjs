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
 * Metro tries every platform-suffixed variant first, then every `.native` one,
 * then the bare extensions — not extension-major.
 */
export function extensionsFor(platform) {
  const suffix = platform === "android" ? "android" : "ios";
  return [
    ...METRO_SOURCE_EXTS.map((e) => `.${suffix}.${e}`),
    ...METRO_SOURCE_EXTS.map((e) => `.native.${e}`),
    ...METRO_SOURCE_EXTS.map((e) => `.${e}`),
  ];
}

// Per-worker resolution cache: `${platform}\0${absBase}` → resolved path | null.
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
export function resolvePlatformFile(absBase, platform = "ios") {
  const key = platform + "\0" + absBase;
  const cached = resolveCache.get(key);
  if (cached !== undefined) return cached;
  const resolved = scanPlatformFile(absBase, platform);
  resolveCache.set(key, resolved);
  return resolved;
}

function scanPlatformFile(absBase, platform) {
  const extensions = extensionsFor(platform);
  for (const ext of extensions) {
    if (fs.existsSync(absBase + ext)) return absBase + ext;
  }
  for (const ext of extensions) {
    const idx = path.join(absBase, "index" + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

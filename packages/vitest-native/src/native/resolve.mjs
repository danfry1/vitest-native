// Metro-style platform-extension resolution: prefer the configured platform,
// then .native, then generic TS/JS variants, and fall back to a directory index.
// Shared by the require hook and the loader.
import fs from "node:fs";
import path from "node:path";

function extensionsFor(platform) {
  const suffix = platform === "android" ? "android" : "ios";
  return [
    `.${suffix}.tsx`,
    `.${suffix}.ts`,
    `.${suffix}.jsx`,
    `.${suffix}.js`,
    ".native.tsx",
    ".native.ts",
    ".native.jsx",
    ".native.js",
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
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

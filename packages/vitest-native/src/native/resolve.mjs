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

/**
 * Given an absolute base path with no extension (e.g. ".../Foo"), return the
 * first existing platform variant (".../Foo.ios.tsx", etc.) or directory index,
 * or null if none exist.
 */
export function resolvePlatformFile(absBase, platform = "ios") {
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

// Metro-style platform-extension resolution: prefer .ios.js / .native.js over .js,
// and fall back to a directory index. Shared by the require hook and the loader.
import fs from "node:fs";
import path from "node:path";

const EXTS = [".ios.js", ".native.js", ".js"];

/**
 * Given an absolute base path with no extension (e.g. ".../Foo"), return the
 * first existing platform variant (".../Foo.ios.js", etc.) or directory index,
 * or null if none exist.
 */
export function resolvePlatformFile(absBase) {
  for (const ext of EXTS) {
    if (fs.existsSync(absBase + ext)) return absBase + ext;
  }
  for (const ext of EXTS) {
    const idx = path.join(absBase, "index" + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

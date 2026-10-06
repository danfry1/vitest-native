/**
 * Vitest's persistent transform cache (`fsModuleCache`), keyed for what this plugin
 * contributes.
 *
 * Vitest 5 can keep transformed modules on disk between runs, as Jest keeps its
 * transform cache. Measured on a 104-file production Expo suite, it cut warm runs by
 * about 11%. Vitest keys each entry on the module's id and source, the config file's
 * contents, the plugin NAMES, `resolve`, NODE_ENV and its own version — not on plugin
 * versions, nor on anything a plugin reads from disk. This plugin's output depends on
 * both: its own version, and the installed packages (which presets are detected, which
 * packages compile). Vitest's official extension point, a cache key generator, carries
 * that part of the key:
 *   - the vitest-native version,
 *   - the plugin's resolved options and the environment it hands to workers,
 *   - the project's lockfile(s), so any dependency change invalidates the cache.
 * Without a lockfile the root package.json stands in for it.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

const sha1 = (value: string | Buffer): string => createHash("sha1").update(value).digest("hex");

/** A digest of the nearest lockfiles at or above `root`, else of its package.json. */
export function dependencyFingerprint(root: string): string {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const found = LOCKFILES.map((name) => path.join(dir, name)).filter((file) =>
      fs.existsSync(file),
    );
    if (found.length > 0) {
      const hash = createHash("sha1");
      for (const file of found) hash.update(file).update(fs.readFileSync(file));
      return hash.digest("hex");
    }
    if (path.dirname(dir) === dir) break;
  }
  try {
    return sha1(fs.readFileSync(path.join(root, "package.json")));
  } catch {
    return "no-manifest";
  }
}

/** The version of the package rooted at `packageDir`. */
export function packageVersionAt(packageDir: string): string {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
    return typeof manifest.version === "string" ? manifest.version : "unknown";
  } catch {
    return "unknown";
  }
}

/** This plugin's contribution to a module's cache key in one project. */
export function fsModuleCacheKey(
  ownPackageDir: string,
  projectRoot: string,
  pluginState: unknown,
): string {
  const state = JSON.stringify(pluginState, (_key, value) =>
    typeof value === "function" || value instanceof RegExp ? String(value) : value,
  );
  return sha1(
    `vitest-native@${packageVersionAt(ownPackageDir)}\0${dependencyFingerprint(projectRoot)}\0${state}`,
  );
}

/**
 * Whether to turn the cache on: Vitest 5 (where `fsModuleCache` is a top-level option)
 * and the user has not chosen either way, in either spelling.
 */
export function shouldDefaultFsModuleCache(
  vitestMajor: number,
  userTest: { fsModuleCache?: unknown; experimental?: { fsModuleCache?: unknown } } | undefined,
): boolean {
  if (!(vitestMajor >= 5)) return false;
  return (
    userTest?.fsModuleCache === undefined && userTest?.experimental?.fsModuleCache === undefined
  );
}

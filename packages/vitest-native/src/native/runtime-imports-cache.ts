/**
 * An on-disk cache of `runtimeImports()` answers, so the runtime-imports detection
 * signal (#763) costs a walk only for packages that changed since the last run.
 *
 * Walking a package's runtime graph reads every file its entries reach: 1.3k–2.5k files
 * and 258–671 ms per config evaluation across the declared packages of three real apps.
 * The answer depends only on the package's installed files, so it is cached per package:
 *
 * - **Key:** the package's real directory. **Valid while** the installed manifest's
 *   name, version, size and mtime are unchanged, and the cache format is this one.
 *   A reinstall or a version change rewrites package.json, so it invalidates that one
 *   entry and no other: a lockfile change re-walks only the packages it changed.
 * - **Never cached:** a package outside node_modules (a workspace member, a `file:` or
 *   `link:` dependency), whose source is edited in place, and a package the project
 *   patches (a `patches/<name>+<version>.patch` file, or `patchedDependencies` in pnpm's
 *   or bun's manifest field), because a patch changes files without touching
 *   package.json.
 * - **Where:** one JSON file in the project's cache root (`cacheRootFor`,
 *   node_modules/.cache/vitest-native), so it travels with the install that produced it
 *   and CI dependency caches restore it.
 * - **Writes:** once per detection, only when an entry was added or replaced, through a
 *   temporary file and a rename, so a concurrent reader never sees half a file. Two
 *   processes writing at once lose nothing that matters: the loser's entries are walked
 *   again next time.
 * - **Failure:** an unreadable, malformed or unwritable cache behaves as an empty one.
 */
import fs from "node:fs";
import path from "node:path";
import { threadId } from "node:worker_threads";

/** Bump when what runtimeImports() collects changes, so older answers are not reused. */
export const RUNTIME_IMPORTS_CACHE_VERSION = 1;
export const RUNTIME_IMPORTS_CACHE_FILE = `runtime-imports-v${RUNTIME_IMPORTS_CACHE_VERSION}.json`;

const NODE_MODULES_DIR = /[\\/]node_modules[\\/]/;

interface Entry {
  /** name@version from the manifest, size and mtime of package.json */
  stamp: string;
  names: string[];
}

export interface RuntimeImportsCache {
  /** The cached answer for a package directory, or undefined to walk it. */
  get(dir: string): Set<string> | undefined;
  /** Record a walked answer (ignored for a package that is never cached). */
  set(dir: string, names: Set<string>): void;
  /** Write the file if anything changed; true when it was written. */
  flush(): boolean;
  /** Counters for diagnostics and tests. */
  readonly stats: { hits: number; misses: number; uncacheable: number };
}

/** A JSON file's object, or null when it is missing or not a JSON object. */
function readJson(file: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The stamp that decides whether a cached answer still holds, or null when the
 * package must be walked every time.
 */
function stampOf(dir: string, patched: ReadonlySet<string>): string | null {
  if (!NODE_MODULES_DIR.test(dir + path.sep)) return null;
  const file = path.join(dir, "package.json");
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat) return null;
  const manifest = readJson(file);
  if (!manifest) return null;
  const id = `${String(manifest.name)}@${String(manifest.version)}`;
  if (patched.has(id) || patched.has(String(manifest.name))) return null;
  return `${id}:${stat.size}:${Math.trunc(stat.mtimeMs)}`;
}

/**
 * Packages the project patches, as `name@version` (or `name` when the patch does not
 * say), read from the roots' `patches/` directories and manifests.
 */
export function patchedPackages(roots: readonly string[]): Set<string> {
  const patched = new Set<string>();
  for (const root of new Set(roots)) {
    // patch-package: patches/<name>+<version>.patch, a scope's slash written as "+".
    const dir = path.join(root, "patches");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    for (const file of files) {
      const match = /^(.+)\+([^+]+)\.patch$/.exec(file);
      if (match) patched.add(`${match[1].replace("+", "/")}@${match[2]}`);
    }
    // pnpm (`pnpm.patchedDependencies`) and bun (`patchedDependencies`): "name@version".
    const manifest = readJson(path.join(root, "package.json")) ?? {};
    const pnpm = manifest.pnpm as Record<string, unknown> | undefined;
    for (const field of [manifest.patchedDependencies, pnpm?.patchedDependencies]) {
      if (!field || typeof field !== "object") continue;
      for (const key of Object.keys(field)) {
        // A key without a version ("name") patches every version of it.
        patched.add(key);
      }
    }
  }
  return patched;
}

/** Open the cache stored in `file` (null: in memory only, for this detection). */
export function openRuntimeImportsCache(
  file: string | null,
  patched: ReadonlySet<string> = new Set(),
): RuntimeImportsCache {
  const parsed = file ? readJson(file) : null;
  const stored: Record<string, Entry> =
    parsed?.version === RUNTIME_IMPORTS_CACHE_VERSION &&
    parsed.entries &&
    typeof parsed.entries === "object"
      ? (parsed.entries as Record<string, Entry>)
      : {};
  const stamps = new Map<string, string | null>();
  const stamp = (dir: string) => {
    if (!stamps.has(dir)) stamps.set(dir, stampOf(dir, patched));
    return stamps.get(dir) ?? null;
  };
  let dirty = false;
  const stats = { hits: 0, misses: 0, uncacheable: 0 };
  return {
    stats,
    get(dir) {
      const current = stamp(dir);
      if (current === null) {
        stats.uncacheable++;
        return undefined;
      }
      const entry = stored[dir];
      if (entry && entry.stamp === current && Array.isArray(entry.names)) {
        stats.hits++;
        return new Set(entry.names);
      }
      stats.misses++;
      return undefined;
    },
    set(dir, names) {
      const current = stamp(dir);
      if (current === null) return;
      stored[dir] = { stamp: current, names: [...names].sort() };
      dirty = true;
    },
    flush() {
      if (!file || !dirty) return false;
      dirty = false;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.${threadId}.tmp`;
        fs.writeFileSync(
          tmp,
          JSON.stringify({ version: RUNTIME_IMPORTS_CACHE_VERSION, entries: stored }),
        );
        fs.renameSync(tmp, file);
        return true;
      } catch {
        // An unwritable cache only costs the next run the walk.
        return false;
      }
    },
  };
}

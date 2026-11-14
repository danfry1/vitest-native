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
 *   patches (a patch-package file in `patches/`, `patchedDependencies` in pnpm's or
 *   bun's manifest field, or a Yarn `patch:` dependency or resolution), because a patch changes files without touching
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

/** A URI-encoded part of a patch name, decoded (as given when it is not valid encoding). */
function decoded(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * The package a patch-package file patches, as `name@version`, or `name` alone when the
 * file name carries no version. patch-package's format:
 * `<name>+<version>[+<sequence>[+<description>]][.dev].patch`, a scope's slash written
 * `+`, and a package nested in another's node_modules written as the path of names
 * joined by `++` (`parent++child+1.0.0.patch`), the last name being the patched one.
 */
export function patchPackageTarget(file: string): string | null {
  const match = /^(.+?)(\.dev)?\.patch$/.exec(file);
  if (!match) return null;
  const segments = match[1].split("++");
  const parts = segments[segments.length - 1].split("+").map(decoded);
  const scoped = parts[0].startsWith("@");
  const name = scoped ? `${parts[0]}/${parts[1] ?? ""}` : parts[0];
  const version = scoped ? parts[2] : parts[1];
  if (!name || name.endsWith("/")) return null;
  return version ? `${name}@${version}` : name;
}

/**
 * The package a Yarn `patch:` descriptor patches (`patch:name@npm%3A1.0.0#./x.patch`), by
 * name: every version of it counts as patched. Null for any other specifier.
 */
function yarnPatchTarget(spec: unknown): string | null {
  if (typeof spec !== "string" || !spec.startsWith("patch:")) return null;
  const match = /^(@[^@/]+\/[^@]+|[^@]+)@/.exec(decoded(spec.slice("patch:".length)));
  return match ? match[1] : null;
}

const YARN_PATCH_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "resolutions",
] as const;

/**
 * Packages the project patches, as `name@version` (or `name` when the patch does not
 * say), read from the roots' `patches/` directories and manifests: patch-package files,
 * pnpm's and bun's `patchedDependencies`, and Yarn's `patch:` protocol.
 */
export function patchedPackages(roots: readonly string[]): Set<string> {
  const patched = new Set<string>();
  for (const root of new Set(roots)) {
    // patch-package: patches/*.patch, named as patchPackageTarget reads them.
    const dir = path.join(root, "patches");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    for (const file of files) {
      const target = patchPackageTarget(file);
      if (target) patched.add(target);
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
    // Yarn: `"name": "patch:name@npm%3A1.0.0#./.yarn/patches/…"`, in dependencies or resolutions.
    for (const field of YARN_PATCH_FIELDS) {
      const specs = manifest[field];
      if (!specs || typeof specs !== "object") continue;
      for (const spec of Object.values(specs)) {
        const target = yarnPatchTarget(spec);
        if (target) patched.add(target);
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

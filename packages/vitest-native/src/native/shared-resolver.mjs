// One resolver for every loading path, behind `experimental.ownershipModel`
// (ADR-0004 and ADR-0005 in the architecture records).
//
// A package loaded by both module systems must be one module. Agreeing on a path is
// not enough on its own: when Vite's resolveId, Node's CommonJS `_resolveFilename` and
// the threaded ESM loader each run their own resolution, a dual-export package, an
// alias, or a deep conditional export can land on different files, and the package
// exists twice with separate module state. Each of the three paths calls the same
// `resolve` here instead, so they cannot disagree.
//
// It answers bare requests only: package names, their subpaths, and the project's
// aliases. Relative and absolute requests keep their existing, already-shared
// resolution (Metro's platform order in resolve.mjs). React Native itself, the test
// runtime and Node's built-ins are never answered here; the registry and Vitest own
// those. Anything this resolver cannot answer returns null and the caller's existing
// resolution runs, so turning the flag on can add agreement but never a new failure.
//
// Each loader realm (the Vite process, each worker's CommonJS loader, each threaded
// ESM loader) holds its own memo. They agree because the inputs and the code are the
// same, not because they share a cache.
import { isBuiltin } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { installedPackageDirOf, packageNameOf } from "./match.mjs";
import { exportTarget, cjsConditionsWithout } from "./export-condition-recovery.mjs";
import { resolvePlatformFile } from "./resolve.mjs";

/** Requests another owner answers: the test runtime, and React Native's own graph. */
const OWNED_ELSEWHERE =
  /^(?:vitest(?:\/|$)|@vitest\/|vite(?:\/|$)|chai$|react-native(?:\/|$)|@react-native\/)/;

/**
 * The flag's transport to workers. Set by the plugin when the project turns
 * `experimental.ownershipModel` on; read once per realm.
 */
export const OWNERSHIP_MODEL_ENV = "VITEST_NATIVE_OWNERSHIP_MODEL";
/** The aliases, in the resolver's own format (see serializeResolutionAliases). */
export const RESOLUTION_ALIASES_ENV = "VITEST_NATIVE_RESOLUTION_ALIASES";

export function ownershipModelEnabled(env = process.env) {
  return env[OWNERSHIP_MODEL_ENV] === "1";
}

/**
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {string} options.platform
 * @param {string[]} options.sourceExts
 * @param {Array<[string | { source: string, flags: string } | { prefix: string }, string]>} [options.aliases]
 * @param {string[]} [options.conditions]  export conditions, `react-native` first
 */
export function createSharedResolver({
  projectRoot,
  platform,
  sourceExts,
  aliases = [],
  conditions = ["react-native", ...cjsConditionsWithout("react-native")],
}) {
  const memo = new Map();
  const packages = new Map();
  const conditionKey = conditions.join(",");
  // Deterministic counts, for the per-file count gate: calls reaching the resolver,
  // memo hits, and misses that did the work.
  const counters = { calls: 0, hits: 0, misses: 0 };

  function packageAt(name, fromDir) {
    const key = `${fromDir}\0${name}`;
    let pkg = packages.get(key);
    if (pkg === undefined) {
      const dir = installedPackageDirOf(name, fromDir);
      pkg = null;
      if (dir) {
        try {
          pkg = { dir, manifest: JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) };
        } catch {
          pkg = null;
        }
      }
      packages.set(key, pkg);
    }
    return pkg;
  }

  /**
   * The real path of the file `request` from `parentFile` loads, or null to let the
   * caller's own resolution decide.
   *
   * @param {string} request
   * @param {string | undefined | null} parentFile  absolute path of the requiring file
   * @param {(id: string) => string} [nodeResolve]  the caller's resolution, for a
   *   package without an `exports` target (today's field policy is Node's own `main`)
   */
  function resolve(request, parentFile, nodeResolve) {
    if (
      typeof request !== "string" ||
      request.length === 0 ||
      isBuiltin(request) ||
      request.startsWith("\0") ||
      request.startsWith(".") ||
      request.startsWith("file:") ||
      path.isAbsolute(request) ||
      OWNED_ELSEWHERE.test(request)
    ) {
      return null;
    }
    counters.calls++;
    const fromDir =
      parentFile && path.isAbsolute(parentFile) ? path.dirname(parentFile) : projectRoot;
    const key = `${fromDir}\0${request}\0${conditionKey}`;
    const held = memo.get(key);
    if (held !== undefined) {
      counters.hits++;
      return held;
    }
    counters.misses++;
    let result = null;
    try {
      const expanded = expandResolutionAlias(request, aliases);
      if (path.isAbsolute(expanded)) {
        result =
          resolvePlatformFile(expanded, platform, sourceExts) ??
          (fs.existsSync(expanded) && fs.statSync(expanded).isFile() ? expanded : null);
      } else if (!OWNED_ELSEWHERE.test(expanded) && !isBuiltin(expanded)) {
        const name = packageNameOf(expanded);
        const pkg = name ? packageAt(name, fromDir) : null;
        if (pkg) {
          const subpath = expanded === name ? "." : `.${expanded.slice(name.length)}`;
          const target =
            pkg.manifest.exports !== undefined
              ? exportTarget(pkg.manifest.exports, subpath, conditions)
              : null;
          if (typeof target === "string" && target.startsWith("./")) {
            result = path.resolve(pkg.dir, target);
          } else if (nodeResolve) {
            result = nodeResolve(expanded);
          }
        } else if (expanded !== request && nodeResolve) {
          // An alias onto a package this directory cannot see: Node decides.
          result = nodeResolve(expanded);
        }
      }
      // Identity is the real file, whichever spelling reached it.
      if (result) result = fs.realpathSync(result);
    } catch {
      result = null;
    }
    // Misses are not held: a file created later (a fixture, a watch edit) is found.
    if (result) memo.set(key, result);
    return result;
  }

  return { resolve, counters };
}

/**
 * The project's aliases in the resolver's format, preserving Vite's order and its
 * matching rules: a string `find` matches the whole request or a prefix followed by
 * `/`; a RegExp `find` matches as RegExp.test does and its replacement uses
 * String.replace (capture groups included). Custom resolvers cannot cross into a
 * worker and are listed as skipped.
 *
 * @param {unknown[]} alias  `{ find, replacement }` entries, in Vite's order
 * @param {string} root  project root, for relative replacements
 */
export function serializeResolutionAliases(alias, root) {
  const entries = [];
  const skipped = [];
  for (const item of alias) {
    const find = item?.find;
    const replacement = item?.replacement;
    if (
      (typeof find !== "string" && !(find instanceof RegExp)) ||
      typeof replacement !== "string" ||
      item.customResolver
    ) {
      skipped.push(String(find));
      continue;
    }
    entries.push([
      find instanceof RegExp ? { source: find.source, flags: find.flags } : find,
      replacement.startsWith(".") ? path.resolve(root, replacement) : replacement,
    ]);
  }
  return { entries, skipped };
}

/**
 * Apply the first matching alias, as Vite's alias plugin does. `{ prefix }` entries
 * are tsconfig `paths` wildcards (`#/*` → `src/*`), whose prefix match differs from a
 * Vite string alias.
 */
export function expandResolutionAlias(specifier, entries) {
  for (const [find, replacement] of entries) {
    if (typeof find === "object" && find !== null && "prefix" in find) {
      if (specifier.startsWith(find.prefix)) {
        return `${replacement.replace(/\/$/, "")}/${specifier.slice(find.prefix.length)}`;
      }
    } else if (typeof find === "object" && find !== null) {
      const re = new RegExp(find.source, find.flags);
      if (re.test(specifier)) {
        return specifier.replace(new RegExp(find.source, find.flags), replacement);
      }
    } else if (
      typeof find === "string" &&
      specifier.startsWith(find) &&
      (specifier.length === find.length || specifier[find.length] === "/")
    ) {
      return specifier.replace(find, replacement);
    }
  }
  return specifier;
}

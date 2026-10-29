// One resolver for every loading path, behind `experimental.ownershipModel: 'resolver'`
// (ADR-0004/0005; docs/ownership-model.md). Vite's resolveId, Node's CommonJS hook and
// its ESM loader each call `resolve` here, built from the same inputs (the project
// context's `resolverInputs`), so a package loaded by both module systems is one module.
// Bare requests only; others return null and the caller's own resolution runs. An
// `exports` target follows the context's conditions (`require` wins on both sides), a
// package without one takes its `react-native` field or the caller's `main`. Errors are
// counted as named fallbacks, never silent. Each realm holds its own resolver; the
// CommonJS one keeps no memo, since the require hook's memo (hooks.mjs) holds answers.
import crypto from "node:crypto";
import { isBuiltin } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { installedPackageDirOf, packageNameOf } from "./match.mjs";
import { exportTarget } from "./export-condition-recovery.mjs";
import { resolvePlatformFile } from "./resolve.mjs";
import { VitestNativeError } from "../errors.mjs";

/** Requests another owner answers: the test runtime, and React Native's own graph. */
const OWNED_ELSEWHERE =
  /^(?:vitest(?:\/|$)|@vitest\/|vite(?:\/|$)|chai$|react-native(?:\/|$)|@react-native\/)/;

/**
 * Fallback reasons that are expected. `unresolved`: nothing on disk answers the
 * request (an optional dependency probed with try/require). Anything else is a
 * resolver error, which the native suite treats as a failure.
 */
export const FALLBACK_ALLOWED = Object.freeze(["unresolved"]);
const UNRESOLVED_CODES = new Set(["MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED", "ENOENT"]);

/** The option's values today; `'resolution'` arrives with the ownership predicate. */
export const OWNERSHIP_MODEL_VALUES = Object.freeze(["resolver"]);

/** Per-realm counters, readable by tests and diagnostics. */
const COUNTERS = Symbol.for("vitest-native.sharedResolver");

export function resolverCounters() {
  return globalThis[COUNTERS];
}

function canonicalInputs(inputs) {
  return {
    projectRoot: inputs.projectRoot,
    platform: inputs.platform,
    sourceExts: inputs.sourceExts ?? null,
    preserveSymlinks: inputs.preserveSymlinks === true,
    aliases: inputs.aliases ?? [],
    conditions: [...(inputs.conditions ?? [])].sort(),
  };
}

/** The hash every realm checks its copy of the inputs against. */
export function resolverInputsHash(inputs) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalInputs(inputs)))
    .digest("hex")
    .slice(0, 20);
}

/**
 * @param {object} inputs  the context's `resolverInputs`
 * @param {object} [options]
 * @param {string} [options.realm]  name used in the counters
 * @param {boolean} [options.memo]  hold answers (default true)
 */
export function createSharedResolver(inputs, { realm = "unknown", memo: useMemo = true } = {}) {
  const { projectRoot, platform } = inputs;
  const sourceExts = inputs.sourceExts ?? ["js", "jsx", "json", "ts", "tsx"];
  const aliases = inputs.aliases ?? [];
  const preserveSymlinks = inputs.preserveSymlinks === true;
  // `react-native` first, as Metro and Jest's preset match it, then the realm-wide set.
  const conditions = [
    "react-native",
    ...[...(inputs.conditions ?? [])].filter((c) => c !== "react-native").sort(),
  ];
  const memo = new Map();
  // Package directories per (requesting directory, name), and manifests per package
  // directory: a manifest is read once however many directories ask for it.
  const dirs = new Map();
  const manifests = new Map();
  const realms = (globalThis[COUNTERS] ??= {});
  const counters = (realms[realm] ??= {
    calls: 0,
    hits: 0,
    misses: 0,
    manifestReads: 0,
    fallbacks: {},
    errors: [],
    // The resolution shadow: requests where the old resolution answers differently.
    deltas: 0,
    deltaSample: [],
  });

  const fallback = (reason) => {
    counters.fallbacks[reason] = (counters.fallbacks[reason] ?? 0) + 1;
    return null;
  };

  function packageAt(name, fromDir) {
    const dirKey = `${fromDir}\0${name}`;
    let dir = dirs.get(dirKey);
    if (dir === undefined) {
      dir = preserveSymlinks
        ? linkedPackageDirOf(name, fromDir)
        : installedPackageDirOf(name, fromDir);
      dirs.set(dirKey, dir);
    }
    if (dir === null) return null;
    let manifest = manifests.get(dir);
    if (manifest === undefined) {
      counters.manifestReads++;
      manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      manifests.set(dir, manifest);
    }
    return { dir, manifest };
  }

  /** A main field's file, completed the way Node completes `main`. */
  function fieldFile(target) {
    if (fs.statSync(target, { throwIfNoEntry: false })?.isFile()) return target;
    return (
      resolvePlatformFile(target, platform, sourceExts) ??
      resolvePlatformFile(path.join(target, "index"), platform, sourceExts)
    );
  }

  /**
   * The real path of the file `request` from `parentFile` loads, or null to let the
   * caller's own resolution decide.
   *
   * @param {string} request
   * @param {string | undefined | null} parentFile  absolute path of the requiring file
   * @param {(id: string) => string} [nodeResolve]  the caller's resolution, for a
   *   package without an `exports` target (Node's own `main`)
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
    const key = `${fromDir}\0${request}`;
    if (useMemo) {
      const held = memo.get(key);
      if (held !== undefined) {
        counters.hits++;
        return held;
      }
    }
    counters.misses++;
    let result = null;
    try {
      const expanded = expandResolutionAlias(request, aliases);
      if (path.isAbsolute(expanded)) {
        result =
          resolvePlatformFile(expanded, platform, sourceExts) ??
          (fs.statSync(expanded, { throwIfNoEntry: false })?.isFile() ? expanded : null);
        if (result === null) return fallback("unresolved");
      } else if (OWNED_ELSEWHERE.test(expanded) || isBuiltin(expanded)) {
        return null;
      } else {
        const name = packageNameOf(expanded);
        const pkg = name ? packageAt(name, fromDir) : null;
        if (pkg) {
          const subpath = expanded === name ? "." : `.${expanded.slice(name.length)}`;
          const target =
            pkg.manifest.exports !== undefined && pkg.manifest.exports !== null
              ? exportTarget(pkg.manifest.exports, subpath, conditions)
              : undefined;
          const field = expanded === name ? pkg.manifest["react-native"] : undefined;
          if (typeof target === "string" && target.startsWith("./")) {
            result = path.resolve(pkg.dir, target);
          } else if (target === undefined && typeof field === "string") {
            // No `exports`: the `react-native` main field wins over `main`, as Metro and
            // the Vite side resolve it (the field policy, ADR-0005). Node's own require
            // would take `main`; under the flag it takes this, so the package is one
            // module.
            result = fieldFile(path.resolve(pkg.dir, field));
            if (result === null) return fallback("unresolved");
          } else if (nodeResolve) {
            result = nodeResolve(expanded);
          } else {
            return null;
          }
        } else if (expanded !== request && nodeResolve) {
          // An alias onto a package this directory cannot see: Node decides.
          result = nodeResolve(expanded);
        } else {
          return null;
        }
      }
      // Identity is the real file, whichever spelling reached it, unless the project
      // runs with --preserve-symlinks, where Node keys modules by the link.
      if (result && !preserveSymlinks) result = fs.realpathSync(result);
    } catch (error) {
      // A package removed since its directory or manifest was held (a test deleting a
      // fixture, an uninstall in watch mode): forget what was held for this request and
      // let the caller's resolution answer, as it would have without the flag.
      if (error?.code === "ENOENT") {
        for (const dirKey of dirs.keys())
          if (dirKey.startsWith(`${fromDir}\0`)) dirs.delete(dirKey);
        manifests.clear();
      }
      // Node's own "no such module" answers, which the caller's resolution then gives.
      const reason = UNRESOLVED_CODES.has(error?.code) ? "unresolved" : "error";
      // The first few, named, so a failing gate says which request and why.
      if (reason !== "unresolved" && counters.errors.length < 5) {
        counters.errors.push(`${request} from ${fromDir}: ${error?.message ?? error}`);
      }
      return fallback(reason);
    }
    // Misses are not held: a file created later (a fixture, a watch edit) is found.
    if (result && useMemo) memo.set(key, result);
    return result;
  }

  /**
   * Record a request where the resolution the flag replaces answers differently: the
   * shadow ADR-0004 asks for, so every behaviour change on a real suite can be listed
   * and explained. Each realm calls it once per distinct request it answered.
   */
  function shadow(request, fromFile, next, previous) {
    if (previous === next || previous == null) return;
    counters.deltas++;
    if (counters.deltaSample.length < 50) {
      counters.deltaSample.push({ request, from: fromFile ?? projectRoot, previous, next });
    }
  }

  /** Forget held answers: the Vite side does this when a watched file is added or removed. */
  function clear() {
    memo.clear();
    dirs.clear();
    manifests.clear();
  }

  return { resolve, shadow, clear, counters, conditions };
}

/** The package directory Node finds from `fromDir`, as spelled (--preserve-symlinks). */
function linkedPackageDirOf(name, fromDir) {
  let dir = path.resolve(fromDir);
  for (;;) {
    const candidate = path.join(dir, "node_modules", ...name.split("/"));
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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

/** Vite's `resolve.alias` in either of its shapes, as a list. */
export function aliasList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([find, replacement]) => ({ find, replacement }));
  }
  return [];
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
      return replacement + specifier.slice(find.length);
    }
  }
  return specifier;
}

/** The `--conditions` / `-C` values in a list of Node options. */
export function conditionsIn(options) {
  const out = [];
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    let value;
    if (option === "--conditions" || option === "-C") value = options[++i];
    else if (option.startsWith("--conditions=")) value = option.slice("--conditions=".length);
    else if (option.startsWith("-C=")) value = option.slice(3);
    if (value) out.push(value);
  }
  return out;
}

/** Split a NODE_OPTIONS string as Node does for unquoted values. */
export function nodeOptionsList(value) {
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

/**
 * Fail by name when a realm's copy of the inputs, or the conditions Node itself
 * applies in it, differ from the record the plugin wrote. Conditions compare as sets:
 * Node treats them as one.
 *
 * @param {object} inputs  the context's `resolverInputs`
 * @param {string} hash  the context's `resolverInputsHash`
 * @param {string} realm
 * @param {{ nodeConditions?: string[] }} [view]  this realm's Node conditions, or
 *   none for the Vite realm, which resolves through the record only
 */
export function checkResolverInputs(inputs, hash, realm, view = {}) {
  const actual = resolverInputsHash(inputs);
  if (actual !== hash) {
    throw mismatch(realm, "hash", `its copy hashes to ${actual}, the context says ${hash}`);
  }
  if (view.nodeConditions) {
    const expected = new Set(inputs.conditions);
    const seen = new Set(view.nodeConditions.filter((c) => c !== "react-native"));
    const missing = [...expected].filter((c) => !seen.has(c)).sort();
    const extra = [...seen].filter((c) => !expected.has(c)).sort();
    if (missing.length > 0 || extra.length > 0) {
      throw mismatch(
        realm,
        "conditions",
        `Node applies ${JSON.stringify([...seen].sort())} here, the context records ` +
          `${JSON.stringify([...expected].sort())}` +
          (extra.length ? `; only here: ${extra.join(", ")}` : "") +
          (missing.length ? `; missing here: ${missing.join(", ")}` : ""),
      );
    }
  }
}

function mismatch(realm, field, detail) {
  return new VitestNativeError(
    "RESOLVER_INPUT_MISMATCH",
    `experimental.ownershipModel: the ${realm} realm resolves with different '${field}' ` +
      `than the project context (${detail}). Every realm must resolve from the same ` +
      `inputs, or a package can load twice. Set --conditions in one place ` +
      `(test.execArgv, or NODE_OPTIONS for the whole run), or report this, with the ` +
      `Vitest config, as a vitest-native bug.`,
  );
}

/**
 * Node's own CommonJS conditions for a process with these features: `require`,
 * `node`, `node-addons`, and `module-sync` where require(esm) is enabled.
 */
export function nodeDefaultConditions(features = process.features) {
  return ["require", "node", "node-addons", ...(features?.require_module ? ["module-sync"] : [])];
}

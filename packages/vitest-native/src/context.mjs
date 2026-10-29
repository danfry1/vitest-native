// One validated, frozen description of a Vitest project, written by the main process
// and read by every worker realm (ADR-0003 in the architecture records).
//
// Configuration used to reach workers as some twenty-five `VITEST_NATIVE_*`
// environment variables, each parsed where it was read, and several parse errors were
// swallowed, so a bad value quietly became a default. Now the plugin writes one
// context file per project and passes workers its location in a single variable,
// `VITEST_NATIVE_CONTEXT=<file>#<key>`. A worker reads the file once per realm,
// validates every field, and freezes it. Anything wrong fails with CONTEXT_INVALID,
// naming the reason and the field, instead of limping on.
//
// The file is content-addressed: its key is the hash of what it holds, so a project
// that changes config writes a new file, and an edited file no longer matches its key.
// Plain .mjs for the same reason as errors.mjs: the native runtime ships verbatim and
// imports this by relative path.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { VitestNativeError } from "./errors.mjs";
import { cjsConditionsWithout } from "./native/export-condition-recovery.mjs";

export const CONTEXT_ENV = "VITEST_NATIVE_CONTEXT";
export const CONTEXT_VERSION = 1;

/**
 * Variables a person sets by hand to change or diagnose a run. They are not project
 * configuration, so they stay environment variables; nothing else under
 * `VITEST_NATIVE_` is read by worker code (tests/context.test.ts enforces this).
 */
export const ESCAPE_HATCHES = Object.freeze([
  // Force the threaded ESM loader hooks (setup.mjs).
  "VITEST_NATIVE_LOADER_THREAD",
  // Load React Native per file instead of from the precompiled registry.
  "VITEST_NATIVE_NO_REGISTRY",
  // Turn hot ESM generation off by hand (the plugin's own opt-out is a context field).
  "VITEST_NATIVE_HOT_ESM_GEN",
  // The hot state-manifest gate's mutation switch (scripts/test-hot-state-manifest.mjs).
  "VITEST_NATIVE_HOT_STATE_MUTATION",
]);

const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isJson = (v) => v !== undefined;
const isAliasFind = (f) =>
  typeof f === "string" ||
  (isObject(f) && typeof f.source === "string" && typeof f.flags === "string") ||
  (isObject(f) && typeof f.prefix === "string");
function isResolverInputs(v) {
  return (
    isObject(v) &&
    typeof v.projectRoot === "string" &&
    path.isAbsolute(v.projectRoot) &&
    (v.platform === "ios" || v.platform === "android") &&
    isStringArray(v.sourceExts) &&
    isStringArray(v.conditions) &&
    isStringArray(v.viteConditions) &&
    typeof v.preserveSymlinks === "boolean" &&
    isObject(v.aliases) &&
    Array.isArray(v.aliases.entries) &&
    v.aliases.entries.every(
      (e) => Array.isArray(e) && e.length === 2 && isAliasFind(e[0]) && typeof e[1] === "string",
    ) &&
    isStringArray(v.aliases.skipped)
  );
}

/**
 * Every field: the environment variable it replaces, how to read that variable's
 * string, and what a valid value looks like. `required` fields are always written.
 */
const FIELDS = [
  {
    key: "platform",
    env: "VITEST_NATIVE_PLATFORM",
    read: (s) => s,
    valid: (v) => v === "ios" || v === "android",
    required: true,
  },
  {
    key: "diagnostics",
    env: "VITEST_NATIVE_DIAGNOSTICS",
    read: (s) => s === "true",
    valid: (v) => typeof v === "boolean",
    required: true,
  },
  {
    key: "projectRoot",
    env: "VITEST_NATIVE_PROJECT_ROOT",
    read: (s) => s,
    valid: (v) => typeof v === "string" && path.isAbsolute(v),
    required: true,
  },
  {
    key: "reactNativeVersion",
    env: "VITEST_NATIVE_RN_VERSION",
    read: (s) => s,
    valid: (v) => typeof v === "string",
  },
  { key: "transform", env: "VITEST_NATIVE_TRANSFORM", read: JSON.parse, valid: isStringArray },
  { key: "sourceExts", env: "VITEST_NATIVE_SOURCE_EXTS", read: JSON.parse, valid: isStringArray },
  { key: "assetExts", env: "VITEST_NATIVE_ASSET_EXTS", read: JSON.parse, valid: isStringArray },
  {
    key: "hotPreserveGlobals",
    env: "VITEST_NATIVE_HOT_PRESERVE_GLOBALS",
    read: JSON.parse,
    valid: isStringArray,
  },
  {
    key: "hotEsmGeneration",
    env: "VITEST_NATIVE_HOT_ESM_GEN",
    read: (s) => s !== "0",
    valid: (v) => typeof v === "boolean",
  },
  {
    key: "registry",
    env: "VITEST_NATIVE_RN_REGISTRY",
    read: (s) => s,
    valid: (v) => typeof v === "string" && path.isAbsolute(v),
  },
  { key: "ownership", env: "VITEST_NATIVE_OWNERSHIP", read: JSON.parse, valid: isObject },
  { key: "projectDirs", env: "VITEST_NATIVE_PROJECT_DIRS", read: JSON.parse, valid: isStringArray },
  {
    key: "requireAliases",
    env: "VITEST_NATIVE_REQUIRE_ALIASES",
    read: JSON.parse,
    valid: (v) =>
      Array.isArray(v) &&
      v.every((e) => Array.isArray(e) && e.length === 2 && e.every((x) => typeof x === "string")),
  },
  {
    key: "requireAliasesSkipped",
    env: "VITEST_NATIVE_REQUIRE_ALIASES_SKIPPED",
    read: JSON.parse,
    valid: isStringArray,
  },
  { key: "presetNames", env: "VITEST_NATIVE_PRESET_NAMES", read: JSON.parse, valid: isStringArray },
  { key: "presetConfig", env: "VITEST_NATIVE_PRESET_CONFIG", read: JSON.parse, valid: isObject },
  { key: "presetExports", env: "VITEST_NATIVE_PRESET_EXPORTS", read: JSON.parse, valid: isObject },
  {
    key: "presetModules",
    env: "VITEST_NATIVE_PRESET_MODULES",
    read: JSON.parse,
    valid: isStringArray,
  },
  {
    key: "presetDisabled",
    env: "VITEST_NATIVE_PRESET_DISABLED",
    read: JSON.parse,
    valid: isStringArray,
  },
  { key: "mocks", env: "VITEST_NATIVE_MOCKS", read: JSON.parse, valid: isJson },
  {
    key: "knownNativeModules",
    env: "VITEST_NATIVE_RN_NATIVE_MODULES",
    read: JSON.parse,
    valid: isStringArray,
  },
  {
    key: "nativeModuleSpecs",
    env: "VITEST_NATIVE_RN_NATIVE_MODULE_SPECS",
    read: JSON.parse,
    valid: isObject,
  },
  {
    key: "nativeModules",
    env: "VITEST_NATIVE_NATIVE_MODULES",
    read: (s) => s,
    valid: (v) => v === "permissive",
  },
  // Not an old variable: the inputs every resolver realm must agree on (see below).
  {
    key: "resolverInputs",
    env: "VITEST_NATIVE_RESOLVER_INPUTS",
    read: JSON.parse,
    valid: isResolverInputs,
    required: true,
  },
];

/** The environment variables the context replaces, for the plugin and the grep gate. */
export const CONTEXT_FIELD_ENVS = Object.freeze(FIELDS.map((f) => f.env));

function invalid(reason, field, detail) {
  return new VitestNativeError(
    "CONTEXT_INVALID",
    `the project context is invalid (${reason}${field ? `: ${field}` : ""}). ${detail} ` +
      `The plugin writes this file for each test run; a stale or hand-edited file, or a ` +
      `worker started without the plugin's configuration, causes this. Re-run Vitest; ` +
      `if it persists, delete node_modules/.cache/vitest-native/contexts.`,
  );
}

function validate(fields) {
  if (!isObject(fields)) throw invalid("schema", null, "Its fields are not an object.");
  const known = new Set(FIELDS.map((f) => f.key));
  for (const name of Object.keys(fields)) {
    if (!known.has(name)) throw invalid("schema", name, `Unknown field '${name}'.`);
  }
  for (const field of FIELDS) {
    const value = fields[field.key];
    if (value === undefined) {
      if (field.required) throw invalid("schema", field.key, `Field '${field.key}' is missing.`);
      continue;
    }
    if (!field.valid(value)) {
      throw invalid("schema", field.key, `Field '${field.key}' has the wrong shape.`);
    }
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function keyOf(fields) {
  return crypto.createHash("sha256").update(JSON.stringify(fields)).digest("hex").slice(0, 20);
}

/**
 * Main process: turn the plugin's per-project settings, still assembled under their
 * old variable names, into validated context fields. A value that does not parse
 * throws here, at config time, rather than in a worker.
 *
 * @param {Record<string, string>} env
 * @returns {Record<string, unknown>}
 */
export function contextFieldsFromSettings(env) {
  const fields = {};
  for (const field of FIELDS) {
    const raw = env[field.env];
    if (raw === undefined) continue;
    try {
      fields[field.key] = field.read(raw);
    } catch (cause) {
      throw invalid("schema", field.key, `Its value does not parse: ${cause?.message ?? cause}.`);
    }
  }
  validate(fields);
  return fields;
}

/**
 * Main process: write the context and return the value for CONTEXT_ENV.
 *
 * @param {Record<string, unknown>} fields  from contextFieldsFromSettings
 * @param {string} cacheRoot  vitest-native's cache root (cacheRootFor in transform.mjs)
 */
export function writeProjectContext(fields, cacheRoot) {
  validate(fields);
  const key = keyOf(fields);
  const dir = path.join(cacheRoot, "contexts");
  const file = path.join(dir, `${key}.json`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    // Written whole, then renamed: a reader never sees half a file.
    const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: CONTEXT_VERSION, key, fields }));
    fs.renameSync(tmp, file);
  }
  return `${file}#${key}`;
}

const loaded = new Map();

/**
 * Worker: the context named by `ref` (default: CONTEXT_ENV), validated and frozen.
 * Read once per realm and reference; later calls return the same object. Returns null
 * only when no reference was given at all, which is code running outside the plugin
 * (a unit test importing a runtime module directly); every reference that is given
 * must be valid.
 *
 * @param {string | undefined} [ref]
 */
export function projectContext(ref = process.env[CONTEXT_ENV]) {
  if (!ref) return null;
  const held = loaded.get(ref);
  if (held) return held;
  const hash = ref.lastIndexOf("#");
  if (hash === -1) throw invalid("missing", null, `'${ref}' does not name a context.`);
  const file = ref.slice(0, hash);
  const key = ref.slice(hash + 1);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (cause) {
    throw invalid(
      cause?.code === "ENOENT" ? "missing" : "schema",
      null,
      `${file} could not be read: ${cause?.message ?? cause}.`,
    );
  }
  if (parsed?.version !== CONTEXT_VERSION) {
    throw invalid(
      "version",
      null,
      `${file} has version ${parsed?.version}, expected ${CONTEXT_VERSION}.`,
    );
  }
  if (parsed.key !== key)
    throw invalid("key", null, `${file} holds key ${parsed.key}, not ${key}.`);
  validate(parsed.fields);
  if (keyOf(parsed.fields) !== key) {
    throw invalid("key", null, `${file} was changed after it was written.`);
  }
  const context = deepFreeze(parsed.fields);
  loaded.set(ref, context);
  return context;
}

/**
 * Worker code that only runs under the plugin: the context, or CONTEXT_INVALID when
 * the worker was started without one.
 */
export function requireProjectContext(ref = process.env[CONTEXT_ENV]) {
  const context = projectContext(ref);
  if (!context) {
    throw invalid("missing", null, `${CONTEXT_ENV} is not set in this worker.`);
  }
  return context;
}

/**
 * The process-level resolution inputs as THIS realm sees them: Node's CommonJS
 * conditions (its execArgv and NODE_OPTIONS) and whether symlinks are preserved.
 * Everything else the resolver uses comes from the context itself, so these are the
 * inputs a realm can disagree on.
 */
export function localResolverView(
  execArgv = process.execArgv,
  nodeOptions = process.env.NODE_OPTIONS ?? "",
) {
  const options = [...execArgv, ...nodeOptions.split(/\s+/).filter(Boolean)];
  return {
    conditions: cjsConditionsWithout("react-native", execArgv),
    preserveSymlinks:
      options.includes("--preserve-symlinks") || process.env.NODE_PRESERVE_SYMLINKS === "1",
  };
}

/**
 * Fail when this realm would resolve from different inputs than the context records.
 * The Vite side, Node's CommonJS hook and the ESM loader must land on the same file
 * for a package, or it loads twice; one shared description only helps if each realm
 * actually resolves from it.
 *
 * @param {Readonly<Record<string, any>>} context
 * @param {string} realm  named in the error ("CommonJS hooks", "ESM loader", "Vite")
 * @param {Partial<Record<string, unknown>>} view  the realm's own values
 */
export function checkResolverInputs(context, realm, view = localResolverView()) {
  const record = context.resolverInputs;
  for (const [field, actual] of Object.entries(view)) {
    const expected = record[field];
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new VitestNativeError(
        "RESOLVER_INPUT_MISMATCH",
        `the ${realm} would resolve packages with a different '${field}' than the rest of ` +
          `the run: ${JSON.stringify(actual)}, not ${JSON.stringify(expected)}. A package ` +
          `can then load as two copies with separate state. Set the option once, where ` +
          `the plugin can see it (test.execArgv or NODE_OPTIONS for the whole run), not ` +
          `for only some workers.`,
      );
    }
  }
}

/** Hash of the resolver inputs, for cache keys and logs. */
export function resolverInputsHash(context) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(context.resolverInputs))
    .digest("hex")
    .slice(0, 16);
}

/**
 * A Vite alias list (either shape) in the context's format, in Vite's order. A RegExp
 * `find` is kept as source and flags; an entry that cannot cross into a worker (a
 * custom resolver, a non-string replacement) is listed by name in `skipped`.
 *
 * @param {unknown} alias
 * @param {string} root  for relative replacements
 */
export function serializeAliasList(alias, root) {
  const list = Array.isArray(alias)
    ? alias
    : isObject(alias)
      ? Object.entries(alias).map(([find, replacement]) => ({ find, replacement }))
      : [];
  const entries = [];
  const skipped = [];
  for (const item of list) {
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

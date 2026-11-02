// One validated, frozen description of a Vitest project (ADR-0003). The plugin writes
// it to a content-addressed file; workers find it through VITEST_NATIVE_CONTEXT, read
// it once per realm and fail by name (CONTEXT_INVALID) when it is wrong, instead of
// turning a bad value into a default. Shipped verbatim and imported by every bundle,
// so each realm holds one instance.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VitestNativeError } from "./errors.mjs";

export const CONTEXT_ENV = "VITEST_NATIVE_CONTEXT";
export const CONTEXT_VERSION = 1;

/** Hand-set diagnostic switches that stay environment variables. */
export const ESCAPE_HATCHES = Object.freeze([
  "VITEST_NATIVE_LOADER_THREAD",
  "VITEST_NATIVE_NO_REGISTRY",
  "VITEST_NATIVE_HOT_ESM_GEN",
  "VITEST_NATIVE_HOT_STATE_MUTATION",
]);

const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const absolute = (v) => typeof v === "string" && path.isAbsolute(v);

/** Every field and its shape. Required fields are always written. */
const SCHEMA = {
  platform: { valid: (v) => v === "ios" || v === "android", required: true },
  diagnostics: { valid: (v) => typeof v === "boolean", required: true },
  projectRoot: { valid: absolute, required: true },
  reactNativeVersion: { valid: (v) => typeof v === "string" },
  transform: { valid: strings },
  sourceExts: { valid: strings },
  assetExts: { valid: strings },
  hotPreserveGlobals: { valid: strings },
  hotEsmGeneration: { valid: (v) => typeof v === "boolean" },
  registry: { valid: absolute },
  ownership: { valid: object },
  projectDirs: { valid: strings },
  requireAliases: {
    valid: (v) =>
      Array.isArray(v) && v.every((e) => Array.isArray(e) && e.length === 2 && strings(e)),
  },
  requireAliasesSkipped: { valid: strings },
  presetNames: { valid: strings },
  presetConfig: { valid: object },
  presetExports: { valid: object },
  presetModules: { valid: strings },
  presetDisabled: { valid: strings },
  mocks: { valid: (v) => v !== undefined },
  knownNativeModules: { valid: strings },
  nativeModuleSpecs: { valid: object },
  nativeModules: { valid: (v) => v === "permissive" },
};

function invalid(reason, field, detail, dir) {
  return new VitestNativeError(
    "CONTEXT_INVALID",
    `the project context is invalid (${reason}${field ? `: ${field}` : ""}). ${detail} ` +
      `The plugin writes it for each run. Re-run Vitest; if it persists, delete ` +
      `${dir ?? "the contexts directory in vitest-native's cache"}.`,
  );
}

function validate(fields, dir) {
  if (!object(fields)) throw invalid("schema", null, "Its fields are not an object.", dir);
  for (const name of Object.keys(fields)) {
    if (!Object.hasOwn(SCHEMA, name)) throw invalid("schema", name, `Unknown field.`, dir);
  }
  for (const [name, { valid, required }] of Object.entries(SCHEMA)) {
    if (fields[name] === undefined) {
      if (required) throw invalid("schema", name, `The field is missing.`, dir);
    } else if (!valid(fields[name])) {
      throw invalid("schema", name, `The field has the wrong shape.`, dir);
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

const keyOf = (fields) =>
  crypto.createHash("sha256").update(JSON.stringify(fields)).digest("hex").slice(0, 20);

/** Files older than this are removed whenever a context is written. */
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Files this process wrote or reused: never pruned while it runs. */
const inUse = new Set();

function writeIn(dir, key, body) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${key}.json`);
  inUse.add(file);
  if (fs.existsSync(file)) {
    // Reused: mark it fresh, or another run's pruning would remove it mid-run.
    const now = new Date();
    fs.utimesSync(file, now, now);
    return file;
  }
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    try {
      fs.renameSync(tmp, file);
    } catch (error) {
      // Another run wrote the same content first (Windows refuses the overwrite).
      if (!((error.code === "EPERM" || error.code === "EEXIST") && fs.existsSync(file))) {
        throw error;
      }
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  for (const name of fs.readdirSync(dir)) {
    const old = path.join(dir, name);
    try {
      if (!inUse.has(old) && Date.now() - fs.statSync(old).mtimeMs > PRUNE_AFTER_MS) {
        fs.rmSync(old, { force: true });
      }
    } catch {
      // Removed by a concurrent run.
    }
  }
  return file;
}

/**
 * Main process: write `fields` and return the value for CONTEXT_ENV. Falls back to the
 * system temp directory when `cacheRoot` cannot be written.
 */
export function writeProjectContext(fields, cacheRoot) {
  validate(fields);
  const key = keyOf(fields);
  const body = JSON.stringify({ version: CONTEXT_VERSION, key, fields });
  let file;
  try {
    file = writeIn(path.join(cacheRoot, "contexts"), key, body);
  } catch {
    file = writeIn(path.join(os.tmpdir(), "vitest-native-cache", "contexts"), key, body);
  }
  return `${file}#${key}`;
}

function read(ref) {
  const hash = ref.lastIndexOf("#");
  if (hash === -1) throw invalid("missing", null, `'${ref}' does not name a context.`);
  const file = ref.slice(0, hash);
  const key = ref.slice(hash + 1);
  const dir = path.dirname(file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (cause) {
    const reason = cause?.code === "ENOENT" ? "missing" : "schema";
    throw invalid(reason, null, `${file} could not be read: ${cause?.message ?? cause}.`, dir);
  }
  if (parsed?.version !== CONTEXT_VERSION) {
    throw invalid("version", null, `${file} has version ${parsed?.version}.`, dir);
  }
  if (parsed.key !== key) throw invalid("key", null, `${file} holds key ${parsed.key}.`, dir);
  validate(parsed.fields, dir);
  if (keyOf(parsed.fields) !== key) {
    throw invalid("key", null, `${file} was changed after it was written.`, dir);
  }
  return parsed.fields;
}

/**
 * Main process: make sure the file behind `ref` holds `fields`, rewriting it when it
 * is missing or fails validation (a cache cleared during a watch session). Returns the
 * reference to use, which moves to the temp directory if the cache cannot be written.
 */
export function ensureProjectContext(ref, fields) {
  const file = ref.slice(0, ref.lastIndexOf("#"));
  try {
    read(ref);
    const now = new Date();
    fs.utimesSync(file, now, now);
    return ref;
  } catch {
    fs.rmSync(file, { force: true });
    return writeProjectContext(fields, path.dirname(path.dirname(file)));
  }
}

const loaded = new Map();

/**
 * Worker: the context named by `ref` (default CONTEXT_ENV), validated and frozen, read
 * once per realm. Null only when no reference is given: code running outside the
 * plugin, which keeps its own defaults.
 */
export function projectContext(ref = process.env[CONTEXT_ENV]) {
  if (!ref) return null;
  let context = loaded.get(ref);
  if (!context) {
    context = deepFreeze(read(ref));
    loaded.set(ref, context);
  }
  return context;
}

/** Worker code that only runs under the plugin. */
export function requireProjectContext(ref = process.env[CONTEXT_ENV]) {
  const context = projectContext(ref);
  if (!context) throw invalid("missing", null, `${CONTEXT_ENV} is not set in this worker.`);
  return context;
}

const HANDLE = Symbol.for("vitest-native");

/** Hot worker boot: record the project this worker serves. */
export function markBootContext(ref = process.env[CONTEXT_ENV]) {
  (globalThis[HANDLE] ??= {}).bootContext = ref;
}

/**
 * Per file: a hot worker serves one project. Vitest refuses to reuse a runner across
 * projects (its isEqualRunner); this is the backstop.
 */
export function assertBootContext(ref = process.env[CONTEXT_ENV]) {
  const boot = globalThis[HANDLE]?.bootContext;
  if (boot !== undefined && boot !== ref) {
    throw invalid(
      "project",
      null,
      `This worker booted for ${boot} and was handed a file from ${ref}. Report this, ` +
        `with the Vitest config, as a vitest-native bug.`,
    );
  }
}

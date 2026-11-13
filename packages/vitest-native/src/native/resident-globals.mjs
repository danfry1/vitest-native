// The globals vitest-native's own resident modules keep for a worker's life. Those
// modules load once per worker, often during its first file, so a global they create
// then would otherwise read to the hot runtime's per-file reset as that file's, and be
// deleted, while the module keeps the deleted object (#792). The reset keeps every key
// listed here; a module creates its global through this list, never with its own
// `Symbol.for`, and tests/resident-globals.test.ts holds src/ to that. This list is the
// declared set a resident-state audit compares a worker against.
export const RESIDENT_GLOBALS = Object.freeze({
  /** bridge-client.mjs: the require bridge's thread starts, fetches and wait time. */
  bridge: Symbol.for("vitest-native.bridge"),
  /** bridge.mjs: modules the bridge evaluated, served from Vite, or failed. */
  bridged: Symbol.for("vitest-native.bridged"),
  /** hooks.mjs: the resolution memo's hits, misses and stale entries. */
  resolutionMemo: Symbol.for("vitest-native.resolutionMemo"),
});

const KEYS = new Set(Object.values(RESIDENT_GLOBALS));

/** Whether `key` names a global listed in RESIDENT_GLOBALS. */
export const isResidentGlobal = (key) => KEYS.has(key);

/** The worker's object for `name`, created by `create` the first time it is asked for. */
export function residentGlobal(name, create) {
  return (globalThis[RESIDENT_GLOBALS[name]] ??= create());
}

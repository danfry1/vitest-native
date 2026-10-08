// Declarative shared-realm state restoration for the hot runtime.
//
// Module isolation resets code. This manifest resets the mutable realm around that
// code: globals, environment, listeners, native boundary state and runtime-specific
// singletons. Every entry is named, captured once at the first file boundary, then
// restored and verified before the next file. A failure names the responsible entry
// instead of being swallowed and turning into an order-dependent later assertion.
import { VitestNativeError, VitestNativeTypeError } from "../errors.mjs";

const NOT_CAPTURED = Symbol("vitest-native.state.not-captured");

function messageOf(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^\[vitest-native\] /, "");
}

export function createStateManifest({ diagnostics = false, mutation = null } = {}) {
  const records = [];
  const ids = new Set();
  let initialized = false;
  let dirty = false;

  function capture(record) {
    try {
      record.snapshot = record.entry.capture();
    } catch (error) {
      throw new VitestNativeError(
        "HOT_STATE_CAPTURE_FAILED",
        `hotRuntime could not capture state manifest entry '${record.entry.id}': ${messageOf(error)}`,
        { cause: error },
      );
    }
  }

  function register(entry) {
    if (!entry || typeof entry.id !== "string" || entry.id.length === 0) {
      throw new VitestNativeTypeError(
        "INVALID_OPTION",
        "state manifest entries require a non-empty string id",
      );
    }
    if (typeof entry.capture !== "function" || typeof entry.restore !== "function") {
      throw new VitestNativeTypeError(
        "INVALID_OPTION",
        `state manifest entry '${entry.id}' requires capture() and restore()`,
      );
    }
    // Setup files re-evaluate per file. Their registration is intentionally
    // idempotent so the first closure owns the worker-lifetime snapshot.
    if (ids.has(entry.id)) return false;
    ids.add(entry.id);
    const record = { entry, snapshot: NOT_CAPTURED, registrationIndex: records.length };
    records.push(record);
    if (initialized) capture(record);
    return true;
  }

  function captureAll() {
    if (initialized) return;
    for (const record of records) capture(record);
    initialized = true;
    if (diagnostics) {
      console.log(
        `[vitest-native] state manifest: ${records.map(({ entry }) => entry.id).join(", ")}`,
      );
    }
  }

  function restoreAll() {
    captureAll();
    if (!dirty) return;
    const failures = [];
    const ordered = [...records].sort(
      (left, right) =>
        (left.entry.restoreOrder ?? 0) - (right.entry.restoreOrder ?? 0) ||
        left.registrationIndex - right.registrationIndex,
    );
    for (const record of ordered) {
      const { entry, snapshot } = record;
      try {
        // Validation can disable one action while leaving verification armed. This
        // is a mutation oracle, not a supported user option.
        if (mutation !== entry.id) entry.restore(snapshot);
      } catch (error) {
        failures.push(`${entry.id} restore: ${messageOf(error)}`);
      }
    }
    // Verify only after every restore has run. Restore domains can interact
    // (for example fake timers own the global Date descriptor), so validating
    // inline would miss damage caused by a later entry.
    for (const record of ordered) {
      const { entry, snapshot } = record;
      if (typeof entry.verify === "function") {
        try {
          entry.verify(snapshot);
        } catch (error) {
          failures.push(`${entry.id} verify: ${messageOf(error)}`);
        }
      }
    }
    if (failures.length > 0) {
      throw new VitestNativeError(
        "HOT_STATE_RESTORE_FAILED",
        `hotRuntime state restoration failed:\n- ${failures.join("\n- ")}`,
      );
    }
    dirty = false;
  }

  function beginFile() {
    captureAll();
    restoreAll();
    dirty = true;
  }

  return Object.freeze({
    register,
    beginFile,
    restore: restoreAll,
    entries: () => records.map(({ entry }) => entry.id),
  });
}

export const HOT_STATE_MANIFEST_ENTRIES = Object.freeze([
  "vitest-runtime",
  "native-boundary-mocks",
  "native-module-mocks",
  "react-native.dimensions",
  "react-native.appearance",
  "react-native.event-listeners",
  "process.env",
  "process.listeners",
  "global.descriptors",
  "console.descriptors",
  "react-native.error-utils",
  "expo.runtime",
  "jest-compat.node-mocks",
]);

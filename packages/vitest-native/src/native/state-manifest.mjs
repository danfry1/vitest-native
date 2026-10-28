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

export function createStateManifest({ diagnostics = false, mutation = null, trace = false } = {}) {
  const records = [];
  const ids = new Set();
  let initialized = false;
  let dirty = false;
  let lastTrace = null;

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
    if (trace) {
      // Ordering oracle for scripts/test-hot-state-manifest.mjs: the order these
      // restores actually ran in, printed whenever it changes. Like `mutation`,
      // an internal validation switch, not a user option.
      const order = ordered.map(({ entry }) => entry.id).join(", ");
      if (order !== lastTrace) {
        lastTrace = order;
        process.stderr.write(`[vitest-native] state restore order: ${order}\n`);
      }
    }
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

// Every built-in entry. Listed in the order a hot run restores them today, as
// documentation only: the order is decided by each registration's `restoreOrder`
// (then registration order), and the contract is HOT_STATE_RESTORE_CONSTRAINTS below.
export const HOT_STATE_MANIFEST_ENTRIES = Object.freeze([
  "vitest-runtime",
  "native-boundary-mocks",
  "jest-compat.node-mocks",
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
]);

const isReactNativeEntry = (id) => id.startsWith("react-native.");

// The restore order the hot runtime depends on, as pairwise constraints: every entry
// matching `before` must restore ahead of every entry matching `after`. Stated apart
// from both the registrations' `restoreOrder` values and HOT_STATE_MANIFEST_ENTRIES,
// so editing either one cannot also edit the expectation.
// scripts/test-hot-state-manifest.mjs checks a real hot run's traced order against it.
export const HOT_STATE_RESTORE_CONSTRAINTS = Object.freeze([
  {
    before: ["vitest-runtime"],
    after: ["native-boundary-mocks", "jest-compat.node-mocks", "global.descriptors"],
    // Vitest's fake-timer uninstall owns Date and deletes it if global.descriptors
    // restores Date first; the mock registries are cleared after Vitest's own state.
    reason: "Vitest's runtime state is restored before every other entry",
  },
  {
    before: ["native-boundary-mocks", "jest-compat.node-mocks"],
    after: isReactNativeEntry,
    // The value-based RN restores reach their modules through the boundary objects and
    // Node's loader, so a previous file's override or `jest.mock(…, () => null)` still
    // answers them (#350: the Appearance restore read `null.setColorScheme` and the
    // next file was never collected).
    reason: "mocks are cleared before React Native state is restored through them",
  },
]);

/**
 * Violations of HOT_STATE_RESTORE_CONSTRAINTS in an observed restore order. Entries
 * absent from `order` constrain nothing.
 * @param {readonly string[]} order
 * @returns {string[]}
 */
export function restoreOrderViolations(order) {
  const matches = (selector, id) =>
    typeof selector === "function" ? selector(id) : selector.includes(id);
  const violations = [];
  for (const { before, after, reason } of HOT_STATE_RESTORE_CONSTRAINTS) {
    order.forEach((late, lateIndex) => {
      if (!matches(after, late)) return;
      for (const early of order.slice(lateIndex + 1)) {
        if (matches(before, early))
          violations.push(`${early} must restore before ${late}: ${reason}`);
      }
    });
  }
  return violations;
}

// Parent-side loader for the small, declarative portion of Metro configuration
// that can safely inform the test resolver.
//
// Metro and Expo configuration bring a large build-tool graph with them and may
// execute user code. Keep that graph in a short-lived child and return data only;
// the Vite main process must never retain Metro module identities.
import { fileURLToPath } from "node:url";
import { runBoundedProcess } from "./bounded-process.mjs";
import { VitestNativeError, VitestNativeTypeError } from "../errors.mjs";

const INITIAL_HEAP_MB = 128;
const RETRY_HEAP_MB = 256;
const TIMEOUT_MS = 30_000;

function stringArray(value, field, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new VitestNativeTypeError(
      "METRO_PROFILE_INVALID",
      `Metro profile returned invalid ${field}`,
    );
  }
  const result = [];
  const seen = new Set();
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      // Metro accepts compound extensions such as `web.js`; separators never belong.
      ((field === "sourceExts" || field === "assetExts") &&
        !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(item))
    ) {
      throw new VitestNativeTypeError(
        "METRO_PROFILE_INVALID",
        `Metro profile returned invalid ${field}`,
      );
    }
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/** Validate the untrusted child payload before it becomes resolver policy. */
export function validateMetroProfile(value, projectRoot) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1) {
    throw new VitestNativeTypeError(
      "METRO_PROFILE_INVALID",
      "Metro profile returned an unsupported schema",
    );
  }
  if (!["expo", "react-native", "fallback"].includes(value.framework)) {
    throw new VitestNativeTypeError(
      "METRO_PROFILE_INVALID",
      "Metro profile returned an invalid framework",
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    projectRoot,
    framework: value.framework,
    configPath: typeof value.configPath === "string" ? value.configPath : null,
    sourceExts: Object.freeze(stringArray(value.sourceExts, "sourceExts")),
    assetExts: Object.freeze(stringArray(value.assetExts, "assetExts", { allowEmpty: true })),
    resolverMainFields: Object.freeze(stringArray(value.resolverMainFields, "resolverMainFields")),
    conditionNames: Object.freeze(
      stringArray(value.conditionNames, "conditionNames", { allowEmpty: true }),
    ),
    customResolver: value.customResolver === true,
    provenance: value.configPath ? "metro-config" : `${value.framework}-default`,
  });
}

/**
 * Evaluate one project's Metro configuration in a bounded child. This is an
 * opt-in experiment consumed by the plugin's metroConfig option.
 */
export async function loadMetroProfile(
  { projectRoot, platform = "ios", configFile },
  runner = runBoundedProcess,
) {
  const result = await runner(
    fileURLToPath(new URL("./metro-profile-compiler.mjs", import.meta.url)),
    { projectRoot, platform, configFile },
    {
      initialHeapMb: INITIAL_HEAP_MB,
      retryHeapMb: RETRY_HEAP_MB,
      timeoutMs: TIMEOUT_MS,
      label: "Metro profile loader",
    },
  );
  if (!result.ok) {
    throw new VitestNativeError(
      "METRO_CONFIG_LOAD_FAILED",
      `Could not load Metro profile: ${result.error ?? "unknown child failure"}`,
    );
  }
  return {
    profile: validateMetroProfile(result.profile, projectRoot),
    evidence: Object.freeze({
      durationMs: result.durationMs,
      heapUsed: result.heapUsed,
      rss: result.rss,
      heapMb: result.heapMb,
      attempts: result.attempts,
    }),
  };
}

export const metroProfileProcessDefaults = Object.freeze({
  initialHeapMb: INITIAL_HEAP_MB,
  retryHeapMb: RETRY_HEAP_MB,
  timeoutMs: TIMEOUT_MS,
});

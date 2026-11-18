import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_EXPO_SDKS } from "../../src/peer-requirements.ts";

const fixturesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "consumer-tests",
);

/**
 * The consumer fixture that pins each supported Expo SDK. The latest-supported check
 * (VN_CONSUMERS=expo-latest) runs each one with `expo` following its SDK to the newest patch.
 */
export const EXPO_SDK_FIXTURES = { 57: "expo-sdk57", 58: "expo" };

/** The `expo` version a consumer fixture pins in its package.json. */
export function fixtureExpoPin(fixture) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(fixturesRoot, fixture, "package.json"), "utf8"),
  );
  return manifest.dependencies?.expo;
}

/**
 * The latest-supported entries: one per SDK in `supported` (SUPPORTED_EXPO_SDKS), each its
 * fixture with `expo` at `~<sdk>.0.0`. Throws, naming every mismatch, when a supported SDK
 * has no fixture, a fixture is listed for an SDK outside the range, or a fixture pins a
 * different SDK from the one it is listed for (npm would install the listed SDK over the
 * fixture's own pins).
 */
export function expoLatestEntries({
  supported = SUPPORTED_EXPO_SDKS,
  fixtures = EXPO_SDK_FIXTURES,
  pinOf = fixtureExpoPin,
} = {}) {
  const problems = [];
  const entries = [];
  for (let sdk = supported.minimum; sdk <= supported.maximum; sdk++) {
    const fixture = fixtures[sdk];
    if (!fixture) {
      problems.push(
        `Expo SDK ${sdk} is supported (SUPPORTED_EXPO_SDKS) but has no fixture in EXPO_SDK_FIXTURES`,
      );
      continue;
    }
    const pin = pinOf(fixture);
    const pinnedSdk = Number(/^\D*(\d+)\./.exec(pin ?? "")?.[1]);
    if (pinnedSdk !== sdk) {
      problems.push(
        `consumer-tests/${fixture} pins expo ${pin} (SDK ${pinnedSdk || "unknown"}), ` +
          `but its latest-supported entry is SDK ${sdk}`,
      );
      continue;
    }
    entries.push({ fixture, sdk, expo: `~${sdk}.0.0` });
  }
  for (const [sdk, fixture] of Object.entries(fixtures)) {
    const n = Number(sdk);
    if (n < supported.minimum || n > supported.maximum) {
      problems.push(
        `EXPO_SDK_FIXTURES lists ${fixture} for Expo SDK ${sdk}, outside the supported ` +
          `${supported.minimum}–${supported.maximum} (SUPPORTED_EXPO_SDKS)`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(`Expo latest-supported list:\n- ${problems.join("\n- ")}`);
  }
  return entries;
}

/**
 * Runs `runEntry(entry, resolved)` for every entry, even after one fails. `runEntry` calls
 * `resolved(versions)` once it knows what it installed. Logs each entry's result and
 * versions, then throws if any failed.
 */
export function runEachExpoEntry(entries, runEntry, log = console.log) {
  const results = [];
  for (const entry of entries) {
    const result = { entry, versions: undefined, error: undefined };
    results.push(result);
    try {
      runEntry(entry, (versions) => {
        result.versions = versions;
      });
    } catch (error) {
      result.error = error;
    }
  }
  const lines = results.map(({ entry, versions, error }) => {
    const label = entry.sdk
      ? `${entry.fixture} (SDK ${entry.sdk})`
      : `${entry.fixture} (expo ${entry.expo})`;
    const resolved = versions
      ? Object.entries(versions)
          .map(([name, version]) => `${name} ${version}`)
          .join(", ")
      : "versions not resolved";
    return `${label}: ${error ? `failed: ${error.message}` : "passed"} (${resolved})`;
  });
  log(`\nExpo versions:\n- ${lines.join("\n- ")}`);
  const failed = results.filter((result) => result.error).length;
  if (failed > 0) {
    throw new Error(
      `Expo versions: ${failed} of ${results.length} failed\n- ${lines.join("\n- ")}`,
    );
  }
}

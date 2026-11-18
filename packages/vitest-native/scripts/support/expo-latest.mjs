import { execFileSync } from "node:child_process";
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
        `consumer-tests/${fixture} pins ${pin ? `expo ${pin}` : "no expo dependency"} (SDK ${pinnedSdk || "unknown"}), ` +
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
 * The oldest npm the Expo legs install with. Expo SDK 57's newest patches pin react 19.2.3,
 * while expo-router's optional react-server-dom-webpack peer (`~19.2.4`) resolves to a
 * release that asks for react ^19.2.9. npm 11.20 installs that tree; npm 11.19 stops with
 * ERESOLVE (#909). CI pins npm at or above this (tests/expo-latest.test.ts checks it).
 */
export const MINIMUM_NPM = "11.20.0";

function installedNpmVersion() {
  return execFileSync("npm", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  }).trim();
}

/** Throws, naming the minimum and the reason, when `version` is older than MINIMUM_NPM. */
function checkNpmVersion(version) {
  const need = `The Expo consumer runs need npm ${MINIMUM_NPM} or newer`;
  const parts = /^(\d+)\.(\d+)\.(\d+)/
    .exec(version ?? "")
    ?.slice(1)
    .map(Number);
  if (!parts) throw new Error(`${need}; could not read the npm version from "${version}"`);
  const minimum = MINIMUM_NPM.split(".").map(Number);
  const index = parts.findIndex((part, i) => part !== minimum[i]);
  if (index !== -1 && parts[index] < minimum[index]) {
    throw new Error(
      `${need}; this is npm ${version}. Older npm stops with ERESOLVE on react: Expo SDK 57 ` +
        "pins react 19.2.3, while expo-router's react-server-dom-webpack peer asks for a " +
        "newer react. CI pins npm through .github/actions/setup (npm-version).",
    );
  }
}

/**
 * Runs `runEntry(entry, resolved)` for every entry, even after one fails. `runEntry` calls
 * `resolved(versions)` once it knows what it installed. Logs each entry's result and
 * versions, then throws if any failed. Before any entry, it refuses an npm older than
 * MINIMUM_NPM (`npmVersion`, read from `npm --version` when not given).
 */
export function runEachExpoEntry(
  entries,
  runEntry,
  { log = console.log, npmVersion = installedNpmVersion() } = {},
) {
  checkNpmVersion(npmVersion);
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
    const names = results.filter((result) => result.error).map(({ entry }) => entry.fixture);
    throw new Error(
      `Expo versions: ${failed} of ${results.length} failed (${names.join(", ")}); see the list above`,
    );
  }
}

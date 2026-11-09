import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * The supported peer-dependency ranges — single source consumed by the plugin's
 * startup validation (plugin.ts configResolved) and the CLI's doctor command,
 * so the two can never drift apart.
 */
export interface PeerRequirement {
  name: string;
  minimum: string;
  maximumMajor?: number;
  /**
   * An optional peer: absent is fine, and a version outside the range is reported
   * but does not block. The plugin has always treated these as a warning; `doctor`
   * must agree, or it reports a blocking problem for a project that runs.
   */
  optional?: boolean;
}

export interface RecommendedFloor {
  /** The first release with the upstream fix. */
  version: string;
  /** The upstream issue, as `owner/repo#number`. */
  issue: string;
  /** What the bug does to a vitest-native user, in one clause. */
  effect: string;
}

export const PEER_REQUIREMENTS: PeerRequirement[] = [
  // Vitest 5 and Vite 8 only (docs/versioning.md). Vitest 4 and Vite 6/7 are refused
  // with UNSUPPORTED_PEER rather than kept on compatibility paths. The ceiling stays one
  // major ahead of what is proven rather than open-ended: a new major must be verified
  // before it is promised.
  { name: "vitest", minimum: "5.0.0", maximumMajor: 6 },
  // 8.0.5 is a security floor: the Vite 8 release carrying a security fix.
  { name: "vite", minimum: "8.0.5", maximumMajor: 9 },
  // React 19 only: the version React Native's supported releases (0.86–0.88) use.
  { name: "react", minimum: "19.0.0" },
  // Optional: only suites that render need it. The range lived in three places —
  // this package's peerDependencies, the plugin's startup check and doctor's own
  // hardcoded major comparison — and none of the three was pinned to the others, so
  // any one could be bumped alone. A test asserts this entry against the published
  // peerDependencies range.
  {
    name: "@testing-library/react-native",
    minimum: "13.0.0",
    maximumMajor: 15,
    optional: true,
  },
];

/**
 * The Expo SDKs this release supports: the ones CI installs as packed Expo apps (SDK 57
 * and 58). Expo is not a peer of this package, so it is not in PEER_REQUIREMENTS, but the
 * plugin's startup check and doctor read the range from here, as they do the peers'.
 */
export const SUPPORTED_EXPO_SDKS = { minimum: 57, maximum: 58 } as const;

/** The SDKs from `minimum` to `maximum` as a list: "57 and 58", "57, 58 or 59". */
export function expoSdkList(
  conjunction: "and" | "or",
  { minimum, maximum }: { minimum: number; maximum: number } = SUPPORTED_EXPO_SDKS,
): string {
  const sdks: number[] = [];
  for (let sdk = minimum; sdk <= maximum; sdk++) sdks.push(sdk);
  return sdks.length === 1
    ? String(sdks[0])
    : `${sdks.slice(0, -1).join(", ")} ${conjunction} ${sdks.at(-1)}`;
}

/**
 * The version in the `expo/package.json` Node resolves from `dir`, or null. Where expo's
 * `exports` leaves its manifest out, the package directory Node would load `expo` from,
 * found along Node's own lookup paths.
 */
function expoVersionFrom(dir: string): string | null {
  const req = createRequire(path.join(dir, "package.json"));
  let manifest: string | undefined;
  try {
    manifest = req.resolve("expo/package.json");
  } catch (error) {
    if ((error as { code?: string }).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") return null;
    manifest = (req.resolve.paths("expo") ?? [])
      .map((modules) => path.join(modules, "expo", "package.json"))
      .find((file) => fs.existsSync(file));
  }
  if (!manifest) return null;
  try {
    const { version } = JSON.parse(fs.readFileSync(manifest, "utf8")) as { version?: unknown };
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * The version of the `expo` the project at `root` uses, or null: the one Node resolves from
 * `root`, else the one a dependency the project declares resolves as its peer. A workspace
 * library that declares only expo-image reaches `expo` that way under an isolated install
 * (pnpm links the peer beside expo-image, not into the library), and a library that uses
 * no Expo package resolves none, whatever another workspace member installs. The plugin
 * and doctor both read it from here.
 */
export function installedExpoVersion(root: string): string | null {
  const own = expoVersionFrom(root);
  if (own) return own;
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const req = createRequire(path.join(root, "package.json"));
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object") continue;
    for (const name of Object.keys(deps)) {
      try {
        // Node resolves to the real path, so the peer is looked for beside the package.
        const file = req.resolve(`${name}/package.json`);
        const dep = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
        const peers = dep.peerDependencies;
        if (!peers || typeof peers !== "object" || !("expo" in peers)) continue;
        // An optional peer (@react-native-vector-icons/* 14) works without expo, so the
        // expo it resolves, such as one pnpm hoisted for another package, says nothing.
        const meta = dep.peerDependenciesMeta as Record<string, { optional?: unknown }> | undefined;
        if (meta?.expo?.optional === true) continue;
        const version = expoVersionFrom(path.dirname(file));
        if (version) return version;
      } catch {
        // Not installed, or its manifest is not exported: it says nothing about expo.
      }
    }
  }
  return null;
}

/**
 * Why the installed Expo SDK is not supported, or null when it is, or when the version is
 * not one this can read. A warning, not an error: an Expo app on an older SDK mostly runs,
 * and failing it at startup would stop the tests that do.
 */
export function unsupportedExpoSdkMessage(expoVersion: string): string | null {
  const match = /^(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(expoVersion);
  if (!match) return null;
  const sdk = Number(match[1]);
  const { minimum, maximum } = SUPPORTED_EXPO_SDKS;
  if (sdk >= minimum && sdk <= maximum) return null;
  const supported = `vitest-native supports Expo SDK ${expoSdkList("and")}`;
  return sdk < minimum
    ? `Expo SDK ${sdk} (expo ${expoVersion}) is not supported: ${supported}. Upgrade to Expo ` +
        `SDK ${expoSdkList("or")}; on an older SDK, tests that load Expo modules can fail.`
    : `Expo SDK ${sdk} (expo ${expoVersion}) is newer than this release supports: ${supported}. ` +
        `Check for a newer vitest-native.`;
}

/**
 * The React Native releases the native engine supports: 0.86 (Expo SDK 57's) to 0.88, the
 * rows of the CI matrix (.github/rn-matrix.json). Below the floor the native engine stops
 * with UNSUPPORTED_PEER; a newer minor only warns. The mock engine reimplements React
 * Native and does not load it, so the range does not apply there.
 */
export const SUPPORTED_REACT_NATIVE = { minimumMinor: 86, maximumMinor: 88 } as const;

/** The minor of a 0.x React Native version ("0.86.3" → 86), or null. */
function reactNativeMinorOf(version: string): number | null {
  const match = /^0\.(\d+)\.\d+(?:[-+].*)?$/.exec(version);
  return match ? Number(match[1]) : null;
}

/** Whether a React Native version is older than the supported range. */
export function isBelowSupportedReactNative(version: string): boolean {
  const minor = reactNativeMinorOf(version);
  return minor !== null && minor < SUPPORTED_REACT_NATIVE.minimumMinor;
}

/** Why a React Native version is outside the supported range, or null. */
export function unsupportedReactNativeMessage(version: string): string | null {
  const minor = reactNativeMinorOf(version);
  if (minor === null) return null;
  const { minimumMinor, maximumMinor } = SUPPORTED_REACT_NATIVE;
  if (minor >= minimumMinor && minor <= maximumMinor) return null;
  const supported = `the native engine supports react-native 0.${minimumMinor}–0.${maximumMinor}`;
  return minor < minimumMinor
    ? `react-native ${version} is not supported: ${supported}. Upgrade react-native to ` +
        `0.${minimumMinor} or later (Expo SDK ${SUPPORTED_EXPO_SDKS.minimum} or later).`
    : `react-native ${version} is newer than this release supports: ${supported}. ` +
        `Check for a newer vitest-native.`;
}

/**
 * Recommended floors (docs/upstream-policy.md §2), by peer: releases below one have an
 * upstream bug that reaches users but still run, so they get one startup warning and a
 * doctor entry, never a refusal. The hard floor stays each peer's `minimum`.
 */
export const RECOMMENDED_FLOORS: Readonly<Record<string, RecommendedFloor>> = {
  vitest: {
    version: "5.1.0",
    issue: "vitest-dev/vitest#11682",
    effect:
      'a startup error is hidden behind "No test files found" and a formatter crash, with Vite 8.3.5 or later',
  },
};

/**
 * The warning for a peer installed below its recommended floor, or null when it is at or
 * above it (or has none). Shared by the plugin's startup warning and doctor.
 */
export function belowRecommendedMessage(name: string, version: string): string | null {
  const floor = RECOMMENDED_FLOORS[name];
  if (!floor || satisfiesMinimum(version, floor.version)) return null;
  return (
    `${name} ${version} is below the recommended ${floor.version}: ${floor.effect} ` +
    `(${floor.issue}, fixed in ${floor.version}). It still runs; upgrade to ${floor.version} ` +
    `or later to avoid it.`
  );
}

/**
 * Whether `version` is at least `minimum`. Prerelease and build metadata are stripped
 * before splitting: "4.0.0-beta.3" split on "." put NaN in the patch slot, so a prerelease
 * sharing the minimum's major.minor (vitest 4.0.0-beta.x against a 4.0.0 floor) failed the
 * check. A prerelease of the minimum itself is accepted, deliberately: rejecting it broke
 * early adopters, and vite and vitest do not publish patch-level prereleases.
 */
export function satisfiesMinimum(version: string, minimum: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^[^0-9]*/, "")
      .split(/[-+]/)[0]
      .split(".")
      .map(Number);
  const [aMaj, aMin = 0, aPat = 0] = parse(version);
  const [bMaj, bMin = 0, bPat = 0] = parse(minimum);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat >= bPat;
}

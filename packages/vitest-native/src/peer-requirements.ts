import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * The supported peer-dependency ranges — single source consumed by the plugin's
 * startup validation (plugin.ts configResolved) and the CLI's doctor command,
 * so the two can never drift apart.
 *
 * `minimumByMajor` entries are security floors: the minimum for that major is
 * the release carrying a security fix, not just the earliest compatible one.
 */
export interface PeerRequirement {
  name: string;
  minimum: string;
  maximumMajor?: number;
  minimumByMajor?: Record<number, string>;
  /**
   * An optional peer: absent is fine, and a version outside the range is reported
   * but does not block. The plugin has always treated these as a warning; `doctor`
   * must agree, or it reports a blocking problem for a project that runs.
   */
  optional?: boolean;
}

export const PEER_REQUIREMENTS: PeerRequirement[] = [
  // Vitest 5 is supported: the whole gate (native, hot, cross-check, soak) runs
  // against it in CI. The ceiling stays one major ahead of what is proven rather
  // than open-ended — Vitest churn is what bit-rotted this plugin's predecessor,
  // so a new major must be verified before it is promised.
  { name: "vitest", minimum: "4.0.0", maximumMajor: 6 },
  {
    name: "vite",
    minimum: "6.4.2",
    maximumMajor: 9,
    minimumByMajor: { 6: "6.4.2", 7: "7.3.2", 8: "8.0.5" },
  },
  { name: "react", minimum: "18.0.0" },
  // Optional: only suites that render need it. The range lived in three places —
  // this package's peerDependencies, the plugin's startup check and doctor's own
  // hardcoded major comparison — and none of the three was pinned to the others, so
  // any one could be bumped alone. A test asserts this entry against the published
  // peerDependencies range.
  {
    name: "@testing-library/react-native",
    minimum: "12.0.0",
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

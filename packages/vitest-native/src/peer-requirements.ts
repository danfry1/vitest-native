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

type Manifest = Record<string, unknown>;

function readManifest(file: string): Manifest | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return manifest && typeof manifest === "object" ? (manifest as Manifest) : null;
  } catch {
    return null;
  }
}

/**
 * The `<name>/package.json` Node resolves from `dir`, or null. Where the package's
 * `exports` leaves its manifest out, the one in the package directory Node would load
 * `name` from, found along Node's own lookup paths. Real paths, as Node resolves them, so
 * a package in an isolated store is looked in beside its own dependencies.
 */
function manifestFileFrom(dir: string, name: string): string | null {
  const req = createRequire(path.join(dir, "package.json"));
  try {
    return req.resolve(`${name}/package.json`);
  } catch (error) {
    if ((error as { code?: string }).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") return null;
    const file = (req.resolve.paths(name) ?? [])
      .map((modules) => path.join(modules, name, "package.json"))
      .find((candidate) => fs.existsSync(candidate));
    return file ? fs.realpathSync(file) : null;
  }
}

function versionFrom(dir: string, name: string): string | null {
  const file = manifestFileFrom(dir, name);
  const version = file ? readManifest(file)?.version : undefined;
  return typeof version === "string" ? version : null;
}

/** The names a manifest lists in one of its dependency fields. */
function declared(manifest: Manifest, field: string): string[] {
  const deps = manifest[field];
  return deps && typeof deps === "object" ? Object.keys(deps) : [];
}

/**
 * Which package says what Expo SDK a project is on, and where it was found.
 *
 * `expo` is the authority. Where it does not resolve, `expo-modules-core` stands in: every
 * Expo module loads it, and a package can reach it without `expo` resolving from anywhere
 * the project looks (a library depending on an Expo module whose own `expo` is linked
 * only beside that module in an isolated store). Its major version is its SDK's for the
 * SDKs this release supports: expo 58 bundles expo-modules-core ~58, and
 * tests/expo-sdk-support.test.ts reads that from the installed expo's
 * `bundledNativeModules.json`. Earlier SDKs numbered expo-modules-core on a scale of its
 * own, so a major below the supported range is read as an older SDK, not as a particular
 * one.
 */
export interface ExpoInstall {
  package: "expo" | "expo-modules-core";
  version: string;
  /**
   * The dependency it was reached through, or null where Node resolves it from the
   * project itself.
   */
  via: string | null;
}

/** A package whose dependencies can lead to Expo: one of React Native's or Expo's. */
function reactNativeEcosystem(manifest: Manifest): boolean {
  return ["dependencies", "peerDependencies"].some((field) =>
    declared(manifest, field).some(
      (name) => name === "react-native" || name === "expo" || name === "expo-modules-core",
    ),
  );
}

/**
 * The Expo the project at `root` uses, or null: the `expo` Node resolves from `root`,
 * else one a package the project depends on resolves as its peer or dependency, else the
 * `expo-modules-core` found the same two ways. The packages are walked from the project's
 * declared dependencies, each resolved from the package that declares it as Node resolves
 * it when that code runs, and through React Native and Expo packages only, whose
 * dependencies are the ones that can load Expo. A workspace library that declares only
 * expo-image reaches `expo` that way under an isolated install (pnpm links the peer
 * beside expo-image, not into the library), and a library that uses no Expo package
 * resolves none, whatever another workspace member installs. The plugin and doctor both
 * read it from here.
 */
export function installedExpoSdk(root: string): ExpoInstall | null {
  const ownExpo = versionFrom(root, "expo");
  if (ownExpo) return { package: "expo", version: ownExpo, via: null };

  const rootManifest = readManifest(path.join(root, "package.json"));
  let modulesCore: ExpoInstall | null = null;
  const ownModulesCore = versionFrom(root, "expo-modules-core");
  if (ownModulesCore) {
    modulesCore = { package: "expo-modules-core", version: ownModulesCore, via: null };
  }
  if (!rootManifest) return modulesCore;

  const seen = new Set<string>();
  let queue = [
    ...declared(rootManifest, "dependencies"),
    ...declared(rootManifest, "devDependencies"),
  ].map((name) => ({ name, from: root, parent: null as string | null }));
  while (queue.length > 0) {
    const next: typeof queue = [];
    for (const { name, from, parent } of queue) {
      const file = manifestFileFrom(from, name);
      if (!file || seen.has(file)) continue;
      seen.add(file);
      const manifest = readManifest(file);
      if (!manifest) continue;
      const dir = path.dirname(file);
      if (name === "expo-modules-core" && !modulesCore) {
        const version = manifest.version;
        if (typeof version === "string") {
          modulesCore = { package: "expo-modules-core", version, via: parent };
        }
      }
      const usesExpo = ["dependencies", "peerDependencies"].some((field) =>
        declared(manifest, field).includes("expo"),
      );
      const expo = usesExpo ? versionFrom(dir, "expo") : null;
      if (expo) return { package: "expo", version: expo, via: name };
      if (!reactNativeEcosystem(manifest)) continue;
      for (const dependency of declared(manifest, "dependencies")) {
        next.push({ name: dependency, from: dir, parent: name });
      }
      if (!modulesCore && declared(manifest, "peerDependencies").includes("expo-modules-core")) {
        const version = versionFrom(dir, "expo-modules-core");
        if (version) modulesCore = { package: "expo-modules-core", version, via: name };
      }
    }
    queue = next;
  }
  return modulesCore;
}

/** What `installedExpoSdk` found, as the plugin's and doctor's messages name it. */
export function describeExpoInstall({ package: name, version, via }: ExpoInstall): string {
  return `${name} ${version}${via ? ` via ${via}` : ""}`;
}

/**
 * Why the installed Expo SDK is not supported, or null when it is, or when the version is
 * not one this can read. A warning, not an error: an Expo app on an older SDK mostly runs,
 * and failing it at startup would stop the tests that do.
 */
export function unsupportedExpoSdkMessage(install: ExpoInstall): string | null {
  const match = /^(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(install.version);
  if (!match) return null;
  const major = Number(match[1]);
  const { minimum, maximum } = SUPPORTED_EXPO_SDKS;
  if (major >= minimum && major <= maximum) return null;
  const supported = `vitest-native supports Expo SDK ${expoSdkList("and")}`;
  const upgrade =
    `Upgrade to Expo SDK ${expoSdkList("or")}; on an older SDK, tests that load Expo ` +
    `modules can fail.`;
  if (major > maximum) {
    return (
      `Expo SDK ${major} (${describeExpoInstall(install)}) is newer than this release supports: ` +
      `${supported}. Check for a newer vitest-native.`
    );
  }
  // An expo-modules-core major below the supported range does not name its SDK (see
  // ExpoInstall); it is older than the supported ones either way.
  return install.package === "expo"
    ? `Expo SDK ${major} (${describeExpoInstall(install)}) is not supported: ${supported}. ${upgrade}`
    : `${describeExpoInstall(install)} is from an Expo SDK older than ${minimum}, which is not ` +
        `supported: ${supported}. ${upgrade}`;
}

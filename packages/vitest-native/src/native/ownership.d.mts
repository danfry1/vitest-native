export type NativeModuleOwner = "vite" | "node" | "vitest-default";
export type NativeOwnershipReason =
  | "test-entry"
  | "project-source"
  | "react-native-core"
  | "explicit-transform"
  | "ecosystem-detected"
  | "runtime-transform"
  | "identity-sensitive-runtime"
  | "test-runtime"
  | "delegated";

export interface NativeOwnershipDecision {
  readonly owner: NativeModuleOwner;
  readonly format: "source" | "cjs" | "package" | "unknown";
  readonly transform: "vite" | "registry" | "native-babel" | "none" | "default";
  readonly reset: "per-file" | "worker-resident" | "worker-resident-if-external" | "vitest-default";
  readonly reason: NativeOwnershipReason;
  readonly reasons: readonly NativeOwnershipReason[];
  readonly evidence: readonly string[];
}

export interface NativeOwnershipRule {
  readonly effect: "owner-transform-reset" | "owner-transform" | "reset-if-external";
  readonly owner?: "vite" | "node";
  readonly transform?: "vite" | "registry" | "native-babel";
  readonly reset?: "per-file" | "worker-resident";
  readonly reason: NativeOwnershipReason;
  readonly packages?: readonly string[];
  readonly roots?: readonly string[];
  readonly patterns?: readonly string[];
}

export interface NativeOwnershipManifest {
  readonly version: 1;
  readonly enforcement: "enforced" | "overridden-by-inline-all";
  readonly projectRoot: string;
  readonly projectDirs: readonly string[];
  readonly reactNativeRoots: readonly string[];
  readonly nodeTransformPackages: readonly string[];
  readonly runtimeTransformAugmentations: readonly string[];
  readonly identityResidentPackages: readonly string[];
  readonly testRuntimeResidentPackages: readonly string[];
  readonly rules: readonly NativeOwnershipRule[];
}

export interface NativeOwnershipPolicy {
  readonly enforcement: "enforced" | "overridden-by-inline-all";
  readonly projectRoot: string;
  readonly nodeTransformPackages: readonly string[];
  readonly externalPatterns: readonly RegExp[];
  readonly testEntryPatterns: readonly RegExp[];
  readonly matchesNodeTransformedFile: (file: string) => boolean;
  readonly isReactNativeFile: (file: string) => boolean;
  /** Normalize a linked RN file to `/react-native/<relative path>` for boundary matching. */
  readonly reactNativePathFor: (file: string) => string | null;
  readonly decideFile: (file: string) => NativeOwnershipDecision;
  readonly manifest: () => NativeOwnershipManifest;
}

export interface NativeOwnershipConflict {
  readonly code: "NATIVE_MODULE_OWNER_CONFLICT";
  readonly file: string;
  readonly observedOwner: "vite" | "node";
  readonly expectedOwner: "vite" | "node";
  readonly decision: NativeOwnershipDecision;
}

export interface NativeOwnershipOptions {
  projectRoot?: string;
  explicitTransforms?: string[];
  ecosystemPackages?: string[];
  runtimeTransforms?: string[];
  runtimeTransformAugmentations?: string[];
  projectDirs?: string[];
  reactNativeRoots?: string[];
  serverDepsInlineAll?: boolean;
}

export declare const TEST_ENTRY_PATTERNS: readonly RegExp[];
export declare const RUNTIME_RESIDENT_PACKAGES: readonly string[];
export declare const RUNTIME_RESIDENT_PATH: RegExp;
export declare const TEST_RUNTIME_RESIDENT_PACKAGES: readonly string[];
export declare const TEST_RUNTIME_RESIDENT_PATH: RegExp;

export declare function isRuntimeResidentFile(file: string): boolean;
export declare function isTestRuntimeResidentFile(file: string): boolean;
export declare function createNativeOwnershipPolicy(
  options?: NativeOwnershipOptions,
): NativeOwnershipPolicy;
export declare function findNativeOwnershipConflict(
  policy: NativeOwnershipPolicy,
  file: string,
  observedOwner: "vite" | "node",
): NativeOwnershipConflict | null;
export declare function findNativeInlineConflicts(
  policy: NativeOwnershipPolicy,
  inline: unknown,
): string[];
export declare function parseNativeOwnershipManifest(
  raw: string | unknown,
): NativeOwnershipManifest | null;
export declare function formatNativeOwnershipManifest(
  manifest: NativeOwnershipManifest | string | unknown,
): string[];

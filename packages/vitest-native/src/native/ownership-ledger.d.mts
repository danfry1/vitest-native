export declare const OWNERSHIP_GUARD_ENV: "VITEST_NATIVE_OWNERSHIP_GUARD";
export declare const OWNERSHIP_MODE_ENV: "VITEST_NATIVE_OWNERSHIP_MODE";
export declare const VITE_MARKER: "__vitest_native_ownership_vite";
export declare const OWNERSHIP_META_KEY: "vitestNativeOwnership";
export declare const JEST_REQUIRE_DEPTH: unique symbol;
export declare const ENGINE_RUNTIME_DIR: string;

export type OwnershipGuardMode = "warn" | "error";

export interface OwnershipGuardConfig {
  mode: OwnershipGuardMode;
  allow: { path: string; reason: string }[];
}

export type DualEvaluationRoute =
  | "jest-compat"
  | "require-from-vite"
  | "node-owned-source"
  | "installed-package"
  | "node-esm"
  | "vite-inline";

export interface DualEvaluation {
  readonly code: "MODULE_DUAL_EVALUATION";
  readonly file: string;
  readonly first: "node" | "vite";
  readonly second: "node" | "vite";
  readonly route: DualEvaluationRoute;
  readonly via: NodeEvaluation["via"];
  readonly owner: "vite" | "node" | "vitest-default" | null;
  readonly message: string;
}

export interface NodeEvaluation {
  via: "cjs" | "require-esm" | "esm" | "json";
  ref?: WeakRef<object>;
  cacheKey?: string;
  parent?: string;
  generation?: number | null;
  jestRequire?: boolean;
  filename?: string;
}

export interface ViteEvaluation {
  file: string;
  key: string;
}

export interface OwnershipLedger {
  readonly mode: OwnershipGuardMode;
  readonly conflicts: DualEvaluation[];
  readonly allowUsed: Set<string>;
  recordNode(
    filename: string,
    entry: NodeEvaluation,
    options?: { key?: string; deferred?: boolean },
  ): void;
  recordVite(key: string, file: string): void;
}

import type { MessagePort } from "node:worker_threads";

export interface InstalledOwnershipLedger extends OwnershipLedger {
  /** Records what the off-thread ESM loader posted since the last drain. */
  drain(): void;
  /** The port the off-thread loader posts its ESM loads to. */
  loaderPort(): MessagePort;
}

export declare function ledgerKey(file: string): string;
export declare function realKey(file: string): string;
export declare function viteMarkerFor(id: string): string | null;
export declare function parseOwnershipGuardConfig(raw: string | undefined): OwnershipGuardConfig;
export declare function createOwnershipLedger(options?: {
  mode?: OwnershipGuardMode;
  allow?: { path: string; reason: string }[];
  exemptDirs?: string[];
  nodeLive?: (entry: NodeEvaluation) => boolean;
  viteLive?: (entry: ViteEvaluation) => boolean;
  viteImporter?: (entry: ViteEvaluation) => string | null;
  ownerOf?: (file: string) => { owner: string; reason: string } | null;
  warn?: (message: string) => void;
}): OwnershipLedger;
export declare function installOwnershipLedger(options?: {
  projectRoot?: string;
}): InstalledOwnershipLedger;

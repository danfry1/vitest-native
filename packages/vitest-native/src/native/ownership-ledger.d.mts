export declare const OWNERSHIP_GUARD_ENV: "VITEST_NATIVE_OWNERSHIP_GUARD";
export declare const OWNERSHIP_MODE_ENV: "VITEST_NATIVE_OWNERSHIP_MODE";
export declare const VITE_MARKER: "__vitest_native_ownership_vite";
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
  readonly owner: "vite" | "node" | "vitest-default" | null;
}

export interface NodeEvaluation {
  via: "cjs" | "esm";
  module?: unknown;
  parent?: string;
  generation?: number | null;
  stack?: string;
  filename?: string;
}

export interface ViteEvaluation {
  file: string;
  key: string;
}

export interface OwnershipLedger {
  readonly mode: OwnershipGuardMode;
  readonly conflicts: DualEvaluation[];
  recordNode(filename: string, entry: NodeEvaluation): void;
  recordVite(key: string, file: string): void;
}

export declare function ledgerKey(file: string): string;
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
export declare function installOwnershipLedger(options?: { projectRoot?: string }): OwnershipLedger;

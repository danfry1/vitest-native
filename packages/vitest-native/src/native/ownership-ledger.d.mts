export declare const OWNERSHIP_CHANNEL: "ownership";
export declare const OWNERSHIP_ACCESS: string;
export declare const OWNERSHIP_META_KEY: "vitestNativeOwnership";
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
  | "installed-typescript"
  | "vite-inline";

/** Where Node's load began: the first file of its chain that Node loaded from outside. */
export interface DualEvaluationCause {
  readonly route: DualEvaluationRoute;
  readonly file: string;
}

export declare const OWNERSHIP_ROUTES: Record<DualEvaluationRoute, { label: string; fix: string }>;
/** Node's loader for a file, as the guard names it. */
export declare const OWNERSHIP_VIA: Record<"cjs" | "require-esm" | "esm" | "json", string>;

export interface DualEvaluation {
  readonly code: "SOURCE_EVALUATED_TWICE";
  readonly file: string;
  readonly first: "node" | "vite";
  readonly second: "node" | "vite";
  readonly route: DualEvaluationRoute;
  readonly cause: DualEvaluationCause;
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
  recordNode(filename: string, entry: NodeEvaluation, options?: { key?: string }): void;
  recordVite(key: string, file: string): void;
}

/** The ledger installed in this worker, on the dispatcher's "ownership" channel. */
export type InstalledOwnershipLedger = OwnershipLedger;

export declare function ledgerKey(file: string): string;
export declare function realKey(file: string): string;
export declare function fileKey(file: string): string;
export declare function viteMarkerFor(id: string): string | null;
export declare function parseOwnershipGuardConfig(
  raw: string | Partial<OwnershipGuardConfig> | undefined,
): OwnershipGuardConfig;
export declare function createOwnershipLedger(options?: {
  mode?: OwnershipGuardMode;
  allow?: { path: string; reason: string }[];
  exemptDirs?: string[];
  nodeLive?: (entry: NodeEvaluation) => boolean;
  viteLive?: (entry: ViteEvaluation) => boolean;
  viteImporter?: (entry: ViteEvaluation) => string | null;
  ownerOf?: (file: string) => { owner: string; reason: string } | null;
  nodeHolds?: (file: string) => boolean;
  /** The key a Node file name is recorded and looked up under (default: nodeKey). */
  keyOf?: (file: string) => string;
  warn?: (message: string) => void;
}): OwnershipLedger;
export declare function installOwnershipLedger(options?: {
  projectRoot?: string;
}): InstalledOwnershipLedger;

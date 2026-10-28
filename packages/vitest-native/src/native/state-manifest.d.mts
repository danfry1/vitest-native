export interface StateManifestEntry<Snapshot = unknown> {
  id: string;
  /** Lower values restore first. Equal values preserve registration order. */
  restoreOrder?: number;
  capture(): Snapshot;
  restore(snapshot: Snapshot): void;
  verify?(snapshot: Snapshot): void;
}

export interface StateManifest {
  register(entry: StateManifestEntry): boolean;
  beginFile(): void;
  restore(): void;
  entries(): string[];
}

export declare function createStateManifest(options?: {
  diagnostics?: boolean;
  mutation?: string | null;
  trace?: boolean;
}): StateManifest;

/** Every built-in entry (documentation order; see HOT_STATE_RESTORE_CONSTRAINTS). */
export declare const HOT_STATE_MANIFEST_ENTRIES: readonly string[];

export declare const HOT_STATE_RESTORE_CONSTRAINTS: readonly {
  before: readonly string[] | ((id: string) => boolean);
  after: readonly string[] | ((id: string) => boolean);
  reason: string;
}[];

/** Violations of HOT_STATE_RESTORE_CONSTRAINTS in an observed restore order. */
export declare function restoreOrderViolations(order: readonly string[]): string[];

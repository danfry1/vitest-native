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
}): StateManifest;

export declare const HOT_STATE_MANIFEST_ENTRIES: readonly string[];

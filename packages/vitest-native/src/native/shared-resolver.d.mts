/** An alias entry: a Vite string `find`, a serialized RegExp, or a tsconfig wildcard prefix. */
export type ResolutionAliasFind = string | { source: string; flags: string } | { prefix: string };
export type ResolutionAlias = [ResolutionAliasFind, string];

/** What every realm builds its resolver from (the project context's `resolverInputs`). */
export interface ResolverInputs {
  projectRoot: string;
  platform: string;
  sourceExts?: string[];
  preserveSymlinks?: boolean;
  aliases?: ResolutionAlias[];
  /** Node's CommonJS conditions in the workers, `react-native` excluded. */
  conditions?: string[];
}

export interface ResolverCounters {
  calls: number;
  hits: number;
  misses: number;
  manifestReads: number;
  fallbacks: Record<string, number>;
  /** The first few errors, named. */
  errors: string[];
  /** Requests the replaced resolution answered differently, and the first 50. */
  deltas: number;
  deltaSample: { request: string; from: string; previous: string; next: string }[];
}

export declare const FALLBACK_ALLOWED: readonly string[];
export declare const OWNERSHIP_MODEL_VALUES: readonly string[];

export declare function resolverCounters(): Record<string, ResolverCounters> | undefined;
export declare function resolverInputsHash(inputs: ResolverInputs): string;

export interface SharedResolver {
  /** The real path `request` loads from `parentFile`, or null to let the caller decide. */
  resolve(
    request: string,
    parentFile: string | null | undefined,
    nodeResolve?: (id: string) => string,
  ): string | null;
  shadow(
    request: string,
    fromFile: string | null | undefined,
    next: string,
    previous: string | null | undefined,
  ): void;
  clear(): void;
  counters: ResolverCounters;
  conditions: string[];
}

export declare function createSharedResolver(
  inputs: ResolverInputs,
  options?: { realm?: string; memo?: boolean },
): SharedResolver;

export declare function serializeResolutionAliases(
  alias: unknown[],
  root: string,
): { entries: ResolutionAlias[]; skipped: string[] };

export declare function aliasList(value: unknown): unknown[];

export declare function expandResolutionAlias(
  specifier: string,
  entries: ResolutionAlias[],
): string;

export declare function conditionsIn(options: string[]): string[];
export declare function nodeOptionsList(value: unknown): string[];

export declare function checkResolverInputs(
  inputs: ResolverInputs,
  hash: string,
  realm: string,
  view?: { nodeConditions?: string[] },
): void;

export declare function nodeDefaultConditions(features?: { require_module?: boolean }): string[];

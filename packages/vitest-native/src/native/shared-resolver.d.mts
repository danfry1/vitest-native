/** An alias entry: a Vite string `find`, a serialized RegExp, or a tsconfig wildcard prefix. */
export type ResolutionAliasFind = string | { source: string; flags: string } | { prefix: string };
export type ResolutionAlias = [ResolutionAliasFind, string];

/** The environment variable that carries `experimental.ownershipModel` to workers. */
export declare const OWNERSHIP_MODEL_ENV: string;
/** The environment variable that carries the resolver's aliases to workers. */
export declare const RESOLUTION_ALIASES_ENV: string;

export declare function ownershipModelEnabled(env?: Record<string, string | undefined>): boolean;

export interface SharedResolver {
  /** The real path `request` loads from `parentFile`, or null to let the caller decide. */
  resolve(
    request: string,
    parentFile: string | null | undefined,
    nodeResolve?: (id: string) => string,
  ): string | null;
  counters: { calls: number; hits: number; misses: number };
}

export declare function createSharedResolver(options: {
  projectRoot: string;
  platform: string;
  sourceExts: string[];
  aliases?: ResolutionAlias[];
  conditions?: string[];
}): SharedResolver;

export declare function serializeResolutionAliases(
  alias: unknown[],
  root: string,
): { entries: ResolutionAlias[]; skipped: string[] };

export declare function expandResolutionAlias(specifier: string, entries: ResolutionAlias[]): string;

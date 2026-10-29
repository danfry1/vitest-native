export declare const CONTEXT_ENV: "VITEST_NATIVE_CONTEXT";
export declare const CONTEXT_VERSION: number;
/** Hand-set variables that stay environment variables. */
export declare const ESCAPE_HATCHES: readonly string[];
/** The environment variables the context replaces. */
export declare const CONTEXT_FIELD_ENVS: readonly string[];

export interface ProjectContextFields {
  platform: "ios" | "android";
  diagnostics: boolean;
  projectRoot: string;
  reactNativeVersion?: string;
  transform?: string[];
  sourceExts?: string[];
  assetExts?: string[];
  hotPreserveGlobals?: string[];
  hotEsmGeneration?: boolean;
  registry?: string;
  ownership?: Record<string, unknown>;
  projectDirs?: string[];
  requireAliases?: [string, string][];
  requireAliasesSkipped?: string[];
  presetNames?: string[];
  presetConfig?: Record<string, Record<string, unknown>>;
  presetExports?: Record<string, unknown>;
  presetModules?: string[];
  presetDisabled?: string[];
  mocks?: unknown;
  knownNativeModules?: string[];
  nativeModuleSpecs?: Record<string, string[]>;
  nativeModules?: "permissive";
  resolverInputs: ResolverInputs;
}

export declare function contextFieldsFromSettings(
  env: Record<string, string>,
): ProjectContextFields;
export declare function writeProjectContext(
  fields: ProjectContextFields,
  cacheRoot: string,
): string;
export declare function projectContext(ref?: string): Readonly<ProjectContextFields> | null;
export declare function requireProjectContext(ref?: string): Readonly<ProjectContextFields>;

export interface ResolverInputs {
  projectRoot: string;
  platform: "ios" | "android";
  sourceExts: string[];
  /** Node's CommonJS conditions for the run's workers, without `react-native`. */
  conditions: string[];
  /** The project's own `resolve.conditions` and `ssr.resolve.conditions`. */
  viteConditions: string[];
  preserveSymlinks: boolean;
  aliases: {
    entries: [string | { source: string; flags: string } | { prefix: string }, string][];
    skipped: string[];
  };
}
export declare function localResolverView(
  execArgv?: string[],
  nodeOptions?: string,
): { conditions: string[]; preserveSymlinks: boolean };
export declare function checkResolverInputs(
  context: Readonly<ProjectContextFields>,
  realm: string,
  view?: Partial<Record<keyof ResolverInputs, unknown>>,
): void;
export declare function resolverInputsHash(context: Readonly<ProjectContextFields>): string;
export declare function serializeAliasList(alias: unknown, root: string): ResolverInputs["aliases"];

export declare const CONTEXT_ENV: "VITEST_NATIVE_CONTEXT";
export declare const CONTEXT_VERSION: number;
/** Hand-set diagnostic switches that stay environment variables. */
export declare const ESCAPE_HATCHES: readonly string[];

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
  presetExports?: Record<string, string[] | null>;
  presetModules?: string[];
  presetDisabled?: string[];
  mocks?: unknown;
  knownNativeModules?: string[];
  nativeModuleSpecs?: Record<string, string[]>;
  nativeModules?: "permissive";
}

export declare function writeProjectContext(
  fields: ProjectContextFields,
  cacheRoot: string,
): string;
export declare function ensureProjectContext(ref: string, fields: ProjectContextFields): string;
export declare function projectContext(ref?: string): Readonly<ProjectContextFields> | null;
export declare function requireProjectContext(ref?: string): Readonly<ProjectContextFields>;
export declare function markBootContext(ref?: string): void;
export declare function assertBootContext(ref?: string): void;

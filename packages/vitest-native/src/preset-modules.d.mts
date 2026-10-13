/**
 * Types for preset-modules.mjs (plain .mjs: see the comment there). Self-contained,
 * since it ships beside the built files; callers narrow the result to their `Preset`.
 */
export interface LoadedPreset {
  name: string;
  modules: Record<string, unknown>;
  [key: string]: unknown;
}

export declare function presetFromModule(namespace: unknown, file: string): LoadedPreset;
export declare function presetModulePaths(): string[];
export declare function importPresetModule(
  vi: { importActual: (path: string) => Promise<unknown> },
  file: string,
): Promise<LoadedPreset>;

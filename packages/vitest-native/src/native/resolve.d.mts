/**
 * Types for resolve.mjs. Hand-written because the implementation is plain .mjs: it
 * is loaded verbatim by the Node-side require hook and ESM loader at run time.
 */

/** Metro's default `sourceExts`, in Metro's own precedence order. */
export declare const METRO_SOURCE_EXTS: string[];

/**
 * Extensions to try for `platform`, in Metro's extension-major order. A
 * project-specific sourceExts list may replace Metro's bare React Native defaults.
 */
export declare function extensionsFor(
  platform: "ios" | "android",
  sourceExts?: readonly string[],
): string[];

/**
 * First existing platform variant of an extensionless absolute base path, or its
 * directory index, or null when nothing matches.
 */
export declare function resolvePlatformFile(
  absBase: string,
  platform?: "ios" | "android",
  sourceExts?: readonly string[],
): string | null;

export declare function resolveDeepPackageFile(
  request: string,
  fromDir: string,
  platform: "ios" | "android",
  sourceExts?: readonly string[],
): string | null;

/**
 * Whether `file` exists under exactly this name, which a case-insensitive disk (macOS,
 * Windows) does not answer by itself.
 */
export declare function existsExact(file: string): boolean;

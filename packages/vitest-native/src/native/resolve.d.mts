/**
 * Types for resolve.mjs. Hand-written because the implementation is plain .mjs: it
 * is loaded verbatim by the Node-side require hook and ESM loader at run time.
 */

/** Metro's default `sourceExts`, in Metro's own precedence order. */
export declare const METRO_SOURCE_EXTS: string[];

/**
 * Extensions to try for `platform`, in Metro's order: every platform-suffixed
 * variant, then every `.native` one, then the bare extensions.
 */
export declare function extensionsFor(platform: "ios" | "android"): string[];

/**
 * First existing platform variant of an extensionless absolute base path, or its
 * directory index, or null when nothing matches.
 */
export declare function resolvePlatformFile(
  absBase: string,
  platform?: "ios" | "android",
): string | null;

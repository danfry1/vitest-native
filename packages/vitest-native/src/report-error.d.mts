/**
 * Types for report-error.mjs. Hand-written because the implementation is plain .mjs —
 * see the comment there for why.
 */

/**
 * Wraps Node's CommonJS `.js` loader so react-test-renderer's bundle evaluates with
 * `reportError` defined on `g`, and removes it after: the renderer captures it, nothing
 * else sees it.
 */
export declare function installRendererReportError(
  Module: typeof import("node:module"),
  g?: typeof globalThis,
): void;

/**
 * The reporter the renderer captures: React's recoverable-error reports are logged with
 * console.error, every other report takes react-test-renderer's fallback.
 */
export declare function reportRendererError(error: unknown): void;

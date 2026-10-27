/**
 * Types for report-error.mjs. Hand-written because the implementation is plain .mjs —
 * see the comment there for why.
 */

/**
 * Defines `reportError` on `g` when it has none: React's recoverable-error reports are
 * logged with console.error, every other report takes react-test-renderer's fallback.
 */
export declare function installReportError(g?: typeof globalThis): void;

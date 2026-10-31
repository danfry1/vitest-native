/**
 * Types for rntl-support.mjs (plain .mjs: see the comment there). Self-contained, since
 * it ships beside the built files.
 */
export declare const RNTL_ENTRY: RegExp;
export declare function installRntlAutoCleanup(
  afterEach: (fn: () => Promise<void>) => void,
  options?: { trackImports?: boolean },
): void;
export declare function noteRntlEntryImported(file: string): void;
export declare function noteIfRntlEntryLoaded(exports: unknown): void;
export declare function installRntlLoadTracking(): void;

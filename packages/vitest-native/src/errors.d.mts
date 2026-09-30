/**
 * Types for errors.mjs. Hand-written because the implementation is plain .mjs — see the
 * comment there for why it cannot be TypeScript.
 */

/**
 * Stable identifiers for the failures this package raises. They are part of the public
 * surface: renaming one is a breaking change for anyone branching on it.
 */
export type VitestNativeErrorCode =
  | "INVALID_OPTION"
  | "UNKNOWN_OPTION"
  | "UNSUPPORTED_PEER"
  | "UNSUPPORTED_POOL"
  | "INLINE_BREAKS_OWNERSHIP"
  | "MODULE_OWNER_CONFLICT"
  | "ENGINE_REQUIRES_BABEL"
  | "MOCKS_REQUIRE_MOCK_ENGINE"
  | "METRO_CONFIG_LOAD_FAILED"
  | "METRO_PROFILE_INVALID"
  | "TRANSFORM_FAILED"
  | "UNTRANSPILED_PACKAGE"
  | "HOT_WORKER_ENV"
  | "HOT_WORKER_PRELOAD"
  | "HOT_RUNTIME_UNAVAILABLE"
  | "HOT_MEMORY_UNBOUNDED"
  | "HOT_MEMORY_BUDGET_EXCEEDED"
  | "HOT_STATE_CAPTURE_FAILED"
  | "HOT_STATE_RESTORE_FAILED"
  | "HOT_CJS_CACHE_RESET"
  | "PRESET_UNAVAILABLE"
  | "WRONG_ENGINE_FOR_HELPER"
  | "HELPERS_BEFORE_SETUP"
  | "JEST_API_UNSUPPORTED"
  | "REQUIRE_ACTUAL_ALIAS_UNSUPPORTED"
  | "MATCHER_BAD_RECEIVER";

export interface VitestNativeErrorOptions {
  cause?: unknown;
  /** A docs URL appended to the message, since fields do not reach the reporter. */
  docs?: string;
}

export declare class VitestNativeError extends Error {
  readonly code: VitestNativeErrorCode;
  constructor(code: VitestNativeErrorCode, message: string, options?: VitestNativeErrorOptions);
}

export declare class VitestNativeTypeError extends TypeError {
  readonly code: VitestNativeErrorCode;
  constructor(code: VitestNativeErrorCode, message: string, options?: VitestNativeErrorOptions);
}

export declare function isVitestNativeError(
  error: unknown,
): error is VitestNativeError | VitestNativeTypeError;

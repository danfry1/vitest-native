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
  | "ENGINE_REQUIRES_BABEL"
  | "MOCKS_REQUIRE_MOCK_ENGINE"
  | "TRANSFORM_FAILED"
  | "UNTRANSPILED_PACKAGE"
  | "HOT_WORKER_ENV"
  | "HOT_WORKER_PRELOAD"
  | "HOT_RUNTIME_UNAVAILABLE"
  | "PRESET_UNAVAILABLE"
  | "WRONG_ENGINE_FOR_HELPER"
  | "HELPERS_BEFORE_SETUP"
  | "JEST_API_UNSUPPORTED"
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

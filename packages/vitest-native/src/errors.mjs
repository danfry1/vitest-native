/**
 * The error types this package throws.
 *
 * Plain .mjs on purpose. The shipped native and jest-compat runtimes are copied to dist
 * verbatim and import this by relative path, and the test suite loads those same files
 * from src — so the module has to resolve identically in both trees. A .ts source would
 * only exist in one of them.
 *
 * WHAT SURVIVES WHERE, measured rather than assumed:
 *
 *   - In the main process, and in a user's own try/catch inside a test, everything is
 *     intact.
 *   - Across the worker/reporter boundary Vitest keeps only `name`, `message` and
 *     `stack`. `code` and every other own property is dropped.
 *
 * So the message must stay self-sufficient: nothing may move out of it into a field on
 * the assumption a reader will see it.
 *
 * `isVitestNativeError` deliberately checks SHAPE rather than `instanceof`. Bundled
 * entries and the verbatim .mjs runtimes can hold separate copies of this module, and a
 * prototype check would quietly fail across that seam. Shape does not care.
 */

const PREFIX = "[vitest-native]";

/** Guarantees the prefix exactly once, however the caller wrote the message. */
function withPrefix(message) {
  return message.startsWith(PREFIX) ? message : `${PREFIX} ${message}`;
}

function buildMessage(message, options) {
  const base = withPrefix(message);
  return options?.docs ? `${base}\nSee ${options.docs}` : base;
}

/** A failure originating in vitest-native. */
export class VitestNativeError extends Error {
  constructor(code, message, options) {
    super(buildMessage(message, options), { cause: options?.cause });
    this.name = "VitestNativeError";
    this.code = code;
  }
}

/**
 * A vitest-native failure that is also a type error — a badly typed option, say.
 * Extends TypeError so `instanceof TypeError` keeps working for consumers.
 */
export class VitestNativeTypeError extends TypeError {
  constructor(code, message, options) {
    super(buildMessage(message, options), { cause: options?.cause });
    this.name = "VitestNativeTypeError";
    this.code = code;
  }
}

/** True for any error this package raised, whichever copy of this module created it. */
export function isVitestNativeError(error) {
  return (
    error instanceof Error &&
    typeof (/** @type {{ code?: unknown }} */ (error).code) === "string" &&
    (error.name === "VitestNativeError" || error.name === "VitestNativeTypeError")
  );
}

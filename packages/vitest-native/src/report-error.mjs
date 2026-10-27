/**
 * `globalThis.reportError` for a test environment that has none, which is Node's.
 *
 * React 19's react-test-renderer reports errors through a function it picks once, as
 * it loads: `reportError` when that is a function, otherwise its own fallback, which
 * dispatches an ErrorEvent on `window` when the environment has one, else emits
 * `uncaughtException` on `process`, else logs (react-test-renderer 19.3.0,
 * cjs/react-test-renderer.development.js:16277-16305). Node has neither `reportError`
 * nor `ErrorEvent`, so every report became an uncaughtException that Vitest counts as
 * an unhandled error and fails the run for.
 *
 * That is right for an uncaught render error, and wrong for a recoverable one. When a
 * component throws once during a concurrent render, React renders the root again
 * synchronously, the retry succeeds, and the root's onRecoverableError receives
 * "There was an error during concurrent rendering but React was able to recover…"
 * (same file, 6893-6902). The test renderer's default handler passes it to the same
 * reporter (6721-6723), so a test whose assertions all pass still failed the run.
 * Elsewhere a recoverable error is logged, not thrown: React 18's test renderer logs it
 * (packages/react-test-renderer/src/ReactTestRenderer.js, onRecoverableError, v18.3.1),
 * as does test-renderer, the renderer RNTL 14 uses, and the React Native renderer on a
 * device; Jest's sandboxed `process` has no uncaughtException listener, so Jest is
 * silent.
 *
 * So a report made by React's recoverable-error handler is logged with console.error,
 * and every other report takes the renderer's own fallback, unchanged: an uncaught
 * render error outside act() still fails the run. (Inside act() React does not report
 * an uncaught error at all: it queues it and act() throws it, 6731-6732.) The
 * recoverable handler is recognised by name, as the function that called this one; it
 * is `defaultOnRecoverableError` in the development and production builds of every
 * React 19 test renderer through 19.3. React's internals (its act queue) are not read,
 * so nothing depends on which copy of React a test loads. If React renames the
 * handler, its reports take the fallback, as they did before this existed, and the
 * engine tests that render a component which throws once fail.
 *
 * Installed only where `reportError` is absent: an environment that has one (jsdom, a
 * project's setup file) keeps it. It must exist before the renderer loads, which is why
 * both engines' setup install it with the other globals.
 *
 * Plain .mjs, like errors.mjs: the native runtime imports it from dist verbatim and the
 * mock engine's bundled setup imports the same source.
 */

/** The function React 19's test renderer reports recoverable errors from. */
const RECOVERABLE_ERROR_HANDLER = "defaultOnRecoverableError";

export function installReportError(g = globalThis) {
  if (typeof g.reportError === "function") return;
  Object.defineProperty(g, "reportError", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: reportError,
  });
}

function reportError(error) {
  if (callerName(reportError) === RECOVERABLE_ERROR_HANDLER) {
    console.error(error);
    return;
  }
  // react-test-renderer 19.3.0's fallback, cjs/react-test-renderer.development.js:16280-16305.
  if (typeof window === "object" && typeof window.ErrorEvent === "function") {
    const event = new window.ErrorEvent("error", {
      bubbles: true,
      cancelable: true,
      message:
        typeof error === "object" && error !== null && typeof error.message === "string"
          ? String(error.message)
          : String(error),
      error,
    });
    if (!window.dispatchEvent(event)) return;
  } else if (typeof process === "object" && typeof process.emit === "function") {
    process.emit("uncaughtException", error);
    return;
  }
  console.error(error);
}

/** The name of the function that called `fn`, from V8's structured stack trace. */
function callerName(fn) {
  const ownPrepare = Object.hasOwn(Error, "prepareStackTrace");
  const { prepareStackTrace, stackTraceLimit } = Error;
  try {
    Error.stackTraceLimit = 1;
    Error.prepareStackTrace = (_error, sites) => sites;
    const holder = {};
    // Frames above and including `fn` are left out, so the first site is its caller.
    Error.captureStackTrace(holder, fn);
    const sites = holder.stack;
    return Array.isArray(sites) ? (sites[0]?.getFunctionName() ?? null) : null;
  } catch {
    return null;
  } finally {
    if (ownPrepare) Error.prepareStackTrace = prepareStackTrace;
    else delete Error.prepareStackTrace;
    Error.stackTraceLimit = stackTraceLimit;
  }
}

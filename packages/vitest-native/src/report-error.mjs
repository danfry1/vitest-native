/**
 * The error reporter React 19's react-test-renderer captures, in an environment without
 * `reportError`, which is Node's.
 *
 * react-test-renderer reports errors through a function it picks once, as its bundle
 * evaluates: `reportError` when that is a function, otherwise its own fallback, which
 * dispatches an ErrorEvent on `window` when the environment has one, else emits
 * `uncaughtException` on `process`, else logs (react-test-renderer 19.3.0,
 * cjs/react-test-renderer.development.js:16277-16305). It keeps that reference and
 * never reads the global again. Node has neither `reportError` nor `ErrorEvent`, so
 * every report became an uncaughtException that Vitest counts as an unhandled error and
 * fails the run for.
 *
 * That is right for an uncaught render error, and wrong for a recoverable one. When a
 * component throws once during a concurrent render, React renders the root again
 * synchronously, the retry succeeds, and the root's onRecoverableError receives
 * "There was an error during concurrent rendering but React was able to recover…"
 * (same file, 6893-6902). The test renderer's default handler passes it to the same
 * reporter (6721-6723), so a test whose assertions all pass still failed the run.
 * Elsewhere a recoverable error is logged, not thrown: React 18.3.1's test renderer
 * logs it with console.error (packages/react-test-renderer/src/ReactTestRenderer.js,
 * onRecoverableError), as does test-renderer, the renderer RNTL 14 uses; React Native
 * on a device logs it as a warning (src/private/renderer/errorhandling/ErrorHandlers.js,
 * onRecoverableError); Jest's sandboxed `process` has no uncaughtException listener, so
 * Jest is silent.
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
 * Only the renderer is given it. `reportError` exists on globalThis just while the
 * renderer's bundle evaluates and is removed after, so a library that feature-detects
 * `reportError` still finds none and behaves as it does under Node. React and
 * scheduler, which the bundle requires, capture it too if they first load inside that
 * window; React uses its copy only for errors thrown by a transition, which reach the
 * fallback here exactly as they would reach its own. An environment that has a
 * `reportError` of its own (jsdom, a project's setup file) keeps it, and the renderer
 * captures that one.
 *
 * The window is the bundle's CommonJS load, which is how react-test-renderer's entry
 * reaches it under both engines. Under the hot runtime the renderer stays resident
 * (ownership.mjs) and keeps the reporter it captured for every later file.
 *
 * Plain .mjs, like errors.mjs: the native runtime imports it from dist verbatim and the
 * mock engine's bundled setup imports the same source.
 */

/** The function React 19's test renderer reports recoverable errors from. */
const RECOVERABLE_ERROR_HANDLER = "defaultOnRecoverableError";

/** react-test-renderer's bundles, which its entry requires: development and production. */
const RENDERER_BUNDLE = /[\\/]react-test-renderer[\\/]cjs[\\/]react-test-renderer\.[^\\/]+\.js$/;

const INSTALLED = Symbol.for("vitest-native.renderer-report-error");

/**
 * Wraps Node's CommonJS `.js` loader so react-test-renderer's bundle evaluates with
 * `reportError` defined on `g` (see above). Once per `Module`: both engines' setup runs
 * for every test file.
 *
 * @param {typeof import("node:module")} Module
 * @param {typeof globalThis} [g]
 */
export function installRendererReportError(Module, g = globalThis) {
  const extensions = Module._extensions;
  if (extensions[INSTALLED]) return;
  const loadJs = extensions[".js"];
  extensions[".js"] = function (mod, filename) {
    if (!RENDERER_BUNDLE.test(filename) || typeof g.reportError === "function") {
      return loadJs.call(this, mod, filename);
    }
    Object.defineProperty(g, "reportError", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: reportRendererError,
    });
    try {
      return loadJs.call(this, mod, filename);
    } finally {
      delete g.reportError;
    }
  };
  Object.defineProperty(extensions, INSTALLED, { value: true });
}

/** What the renderer reports through: recoverable errors are logged, the rest fall back. */
export function reportRendererError(error) {
  if (callerName(reportRendererError) === RECOVERABLE_ERROR_HANDLER) {
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

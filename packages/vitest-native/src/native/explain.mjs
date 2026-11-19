// Turns the native engine's two worst failure moments — a Babel crash while
// transforming a file, and Node choking on untranspiled JSX/Flow from an
// externalized package — into errors that name the package and say what to do.
// Pure functions; used by transform.mjs and hooks.mjs, unit-tested directly.

import { docsUrl } from "../docs-url.mjs";
import { VitestNativeError } from "../errors.mjs";

/** The npm package name owning `file`, from its deepest node_modules segment, or null. */
export function packageNameFromPath(file) {
  const norm = String(file).replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/node_modules/");
  if (idx === -1) return null;
  const rest = norm.slice(idx + "/node_modules/".length);
  const segs = rest.split("/");
  if (!segs[0]) return null;
  if (segs[0].startsWith("@")) return segs[1] ? `${segs[0]}/${segs[1]}` : segs[0];
  return segs[0];
}

/**
 * Decorate a Babel failure from transformRN with the file, platform, and owning
 * package, preserving the original message (Babel's includes a code frame) and
 * chaining the original error as `cause`.
 */
export function decorateTransformError(err, file, platform) {
  const pkg = packageNameFromPath(file);
  const subject = pkg ? `'${pkg}' (${file})` : `${file}`;
  const hint = pkg
    ? `The React Native Babel preset could not parse this file from ${pkg}. ` +
      `If this happens on a package you added to transform: [...], the package may ` +
      `ship syntax the preset can't handle — please report it at ` +
      `https://github.com/danfry1/vitest-native/issues with the error below.`
    : `The React Native Babel preset could not parse this file.`;
  const wrapped = new Error(
    `[vitest-native] Failed to transform ${subject} for platform '${platform}'.\n` +
      `${hint}\n\n${err && err.message ? err.message : String(err)}`,
    { cause: err },
  );
  wrapped.name = err && err.name ? err.name : "Error";
  return wrapped;
}

// Node's SyntaxError messages when it compiles untranspiled JSX / Flow / TS.
// "Unexpected token '<'" = JSX; "Unexpected identifier" / "Unexpected reserved
// word" commonly = type annotations or `import type`.
const UNTRANSPILED_SYNTAX =
  /Unexpected token '?<'?|Unexpected identifier|Unexpected reserved word|Missing initializer in const|Unexpected token ':'/;

// Node's ReferenceError when a MIXED-SYNTAX file runs: top-level `import` makes the
// CJS parse fail, Node retries the file as an ES module (require(esm)), and the
// CommonJS half then dereferences a wrapper variable that ESM scope never defines.
// Metro compiles both halves, so packages ship this shape — react-native-worklets'
// lib/module/mock.js ends in `module.exports = ...` under a header of `import`s.
// It is the runtime sibling of the SyntaxError class above: same cause, same fix,
// but it parses cleanly and so fails AFTER compilation, as a ReferenceError.
const ESM_SCOPE_REFERENCE =
  /\b(?:module|exports|require|__dirname|__filename) is not defined in ES module scope/;

/**
 * When Node throws compiling or running a node_modules file that vitest-native did
 * NOT transform, explain the (very common) real cause: the package ships source
 * only Metro can run — untranspiled JSX/Flow/TS (a SyntaxError), or mixed
 * ESM-import/CommonJS-exports (a ReferenceError from the require(esm) retry) —
 * and needs to be added to `transform: [...]`.
 * Returns a decorated error, or null when the failure doesn't match the pattern.
 */
export function explainUntransformedSyntaxError(err, file) {
  if (!untranspiledFailure(err)) return null;
  return untransformedError(err, file);
}

/** Node's failure on source it can't run as published: the two shapes above. */
function untranspiledFailure(err) {
  return (
    !!err &&
    ((err.name === "SyntaxError" && UNTRANSPILED_SYNTAX.test(String(err.message))) ||
      (err.name === "ReferenceError" && ESM_SCOPE_REFERENCE.test(String(err.message))))
  );
}

/**
 * When Node's compile of `file` fails as untranspiled source (a SyntaxError: nothing in the
 * file ran) and the file belongs to a dependency of a package found only by the installed
 * scan (#883), the error names that dependency and the package that pulled it in, with
 * the option that compiles it. `entries` is the context's scanFoundDependencies:
 * `[dir, name, parent]`. Null otherwise.
 *
 * Not compiled on demand instead: compiling only when Node fails is excluded (ADR-0006),
 * and it would make the dependency Node-compiled for this load while Vite, for a test's
 * own import of it, still owns and compiles it on its side: two instances.
 */
export function explainUncompiledDependency(err, file, entries) {
  if (!entries?.length || err?.name !== "SyntaxError" || !untranspiledFailure(err)) return null;
  const norm = String(file).replace(/\\/g, "/");
  const name = packageNameFromPath(norm);
  if (!name) return null;
  const at = norm.lastIndexOf("/node_modules/") + "/node_modules/".length;
  const dir = norm.slice(0, at + name.length);
  const entry = entries.find(([d]) => d.replace(/\\/g, "/") === dir);
  if (!entry) return null;
  const [, dep, parent] = entry;
  return new VitestNativeError(
    "UNDECLARED_DEPENDENCY_UNCOMPILED",
    `'${dep}' (${dir}) ships source Node can't run directly (${err.message} in ${file}). ` +
      `It is a dependency of '${parent}', an installed React Native package this project ` +
      `does not declare, and vitest-native compiles the dependencies of the packages a ` +
      `project declares. Compile it:\n\n` +
      `  reactNative({ transform: ['${dep}'] })\n\n` +
      `in your vitest config, or declare '${parent}' in your package.json dependencies.`,
    { cause: err, docs: docsUrl("/guide/errors#UNDECLARED_DEPENDENCY_UNCOMPILED") },
  );
}

function untransformedError(err, file) {
  const pkg = packageNameFromPath(file);
  if (!pkg) return null;
  const cause =
    err.name === "ReferenceError"
      ? `This usually means the package publishes mixed ES-module/CommonJS source ` +
        `that only a bundler like Metro can run.`
      : `This usually means the package publishes untranspiled JSX, Flow, or TypeScript.`;
  const Ctor = err.name === "ReferenceError" ? ReferenceError : SyntaxError;
  const wrapped = new Ctor(
    `[vitest-native] '${pkg}' shipped source Node can't run directly ` +
      `(${err.message} in ${file}).\n` +
      `${cause} ` +
      `Ask vitest-native to transform it:\n\n` +
      `  reactNative({ transform: ['${pkg}'] })\n\n` +
      `in your vitest config. See ${docsUrl("/guide/mocking#packages-that-ship-untranspiled-source")}`,
    { cause: err },
  );
  return wrapped;
}

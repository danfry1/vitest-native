// Turns the native engine's two worst failure moments — a Babel crash while
// transforming a file, and Node choking on untranspiled JSX/Flow from an
// externalized package — into errors that name the package and say what to do.
// Pure functions; used by transform.mjs and hooks.mjs, unit-tested directly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
    // Already explained, for the file that failed: a file that requires it ran, and is not
    // to blame.
    !String(err.message).startsWith("[vitest-native]") &&
    ((err.name === "SyntaxError" && UNTRANSPILED_SYNTAX.test(String(err.message))) ||
      (err.name === "ReferenceError" && ESM_SCOPE_REFERENCE.test(String(err.message))))
  );
}

/**
 * When Node cannot run `file` as published, and nothing in it ran (it could not compile
 * it, or could not link it as an ES module), and the file belongs to a dependency of a
 * detected package that is not walked (#883: found only by the installed scan, or
 * declared only by a sibling), the error names that dependency and the package that pulled it in, with
 * the option that compiles it. `entries` is the context's scanFoundDependencies:
 * `[dir, name, parent]`. Null otherwise.
 *
 * Not compiled on demand instead: compiling only when Node fails is excluded (ADR-0006),
 * and it would make the dependency Node-compiled for this load while Vite, for a test's
 * own import of it, still owns and compiles it on its side: two instances.
 */
export function explainUncompiledDependency(err, file, entries) {
  if (!entries?.length) return null;
  // The file Node could not compile, or the dependency's file whose import it could not
  // link: any of its files, however deep in the ES module graph the CommonJS load entered.
  const failed = compileFailure(err, file) ? file : unlinkedImporter(err);
  if (!failed) return null;
  const norm = String(failed).replace(/\\/g, "/");
  const name = packageNameFromPath(norm);
  if (!name) return null;
  const at = norm.lastIndexOf("/node_modules/") + "/node_modules/".length;
  const dir = norm.slice(0, at + name.length);
  const entry = entries.find(([d]) => d.replace(/\\/g, "/") === dir);
  if (!entry) return null;
  // The directory as recorded, in the platform's own spelling.
  const [recorded, dep, parent] = entry;
  return new VitestNativeError(
    "UNDECLARED_DEPENDENCY_UNCOMPILED",
    `'${dep}' (${recorded}) ships source Node can't run directly (${err.message.split("\n")[0]} in ${failed}). ` +
      `It is a dependency of '${parent}', an installed React Native package this project ` +
      `does not declare, and vitest-native compiles the dependencies of the packages a ` +
      `project declares. Compile it:\n\n` +
      `  reactNative({ transform: ['${dep}'] })\n\n` +
      `in your vitest config, or declare '${parent}' in your package.json dependencies.`,
    { cause: err, docs: docsUrl("/guide/errors#UNDECLARED_DEPENDENCY_UNCOMPILED") },
  );
}

/**
 * Node could not compile `file`: an untranspiled-source SyntaxError (JSX, Flow, TypeScript)
 * with no stack frame inside the file. A SyntaxError the file throws as it runs, such as
 * `JSON.parse` of HTML, has one, and is the file's own error.
 */
function compileFailure(err, file) {
  if (err?.name !== "SyntaxError" || !untranspiledFailure(err)) return false;
  const frames = String(err.stack ?? "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "));
  return !frames.some((line) => line.includes(`${file}:`));
}

/**
 * Node loaded a file as an ES module (require(esm)) and could not link one of its imports:
 * a relative import that leaves out `.js` or `/index.js`, which only a bundler resolves
 * (expo-asset's `export * from './Asset'`). No module of the graph ran. Returns the file
 * whose import failed, which can be any file of the package, not only the one `require`
 * entered; null for anything else.
 */
function unlinkedImporter(err) {
  if (err?.code !== "ERR_MODULE_NOT_FOUND") return null;
  // Not "Cannot find package": a bare specifier that is not installed, which compiling
  // the importer cannot fix.
  const found = /^Cannot find module '([^']+)' imported from (.+)$/m.exec(String(err.message));
  if (!found) return null;
  const asPath = (value) => (value.startsWith("file:") ? fileURLToPath(value) : value);
  const missing = asPath(found[1]);
  // Only a request a bundler resolves and Node's ES module resolution does not: the file
  // with `.js` added, or the directory's index. A typo resolves nowhere.
  if (!fs.existsSync(`${missing}.js`) && !fs.existsSync(path.join(missing, "index.js"))) {
    return null;
  }
  return asPath(found[2].trim());
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

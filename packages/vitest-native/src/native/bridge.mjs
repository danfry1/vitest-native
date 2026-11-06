// The require bridge (experimental.ownershipModel: 'resolution'; docs/ownership-model.md):
// Node's `require` of a file Vite owns returns VITE's instance of it, in either load
// order. If Vite already evaluated the file, that instance. If not, the file is fetched
// from the main process (bridge-client.mjs) and evaluated NOW, synchronously, by Vitest's
// own evaluator, into Vite's own module map, so a later `import` of it finds it evaluated
// and gets the same exports: one module, whichever side loaded it first.
//
// How a module is evaluated synchronously, with Vitest's evaluator and nothing mirrored:
// `runInlinedModule` is async, but everything up to its one `await` runs in the call:
// import.meta, its env and defines, the CommonJS globals, the coverage record, compiling
// the wrapper and calling it. Vite's SSR output imports with `await __vite_ssr_import__(`;
// with those awaits blanked (same width, so columns, the source map and coverage offsets
// stay Vitest's), a module without top-level await runs to its last line inside the call.
// A marker on its last line says it did.
//
// What cannot be served fails by name, never as a second copy:
//   REQUIRE_OF_ASYNC_VITE_MODULE      the module has top-level await (checked before it
//                                     runs; dependencies evaluated before it have run)
//   BRIDGED_EVALUATION_FAILED         the module threw while evaluating, here or in Vite
//                                     earlier (its error is the `cause`, attached when the
//                                     evaluation settles); the nodes a failed evaluation
//                                     here created are invalidated, so a later import
//                                     evaluates afresh
//   REQUIRE_OF_EVALUATING_VITE_MODULE the module is part-way through Vite's own (async)
//                                     evaluation, so its exports are not finished. (A
//                                     cycle gets the exports so far: an ES import cycle
//                                     within the bridge's own evaluation, as Vite's runner
//                                     gives it, and a require back into a module from
//                                     inside its evaluation, as Node and Jest give it.)
//
// Mocks are the engine's mock dispatcher's (jest-compat/node-registry.mjs): it serves Node's
// require of a mocked file before the bridge is asked (experimental.nodeMocks, implied by
// 'resolution'), and each import of a module the bridge evaluates asks it (mockFor), so a
// mocked dependency is the test's own instance, or fails there by name.
import Module, { createRequire } from "node:module";
import path from "node:path";
import { inspect } from "node:util";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { VitestNativeError } from "../errors.mjs";
import { projectContext } from "../context.mjs";
import { nodeDispatch } from "../node-dispatch.mjs";
import { fetchSync } from "./bridge-client.mjs";
import { BRIDGE_PROVIDE_KEY } from "./bridge-server.mjs";
import { createNativeOwnershipPolicy, parseNativeOwnershipManifest } from "./ownership.mjs";

const worker = () => globalThis.__vitest_worker__;
const evaluatedModules = () => worker()?.evaluatedModules;
const moduleRunner = () => globalThis.__vitest_mocker__?.moduleRunner;
const environmentName = () => worker()?.environment?.viteEnvironment ?? "ssr";

/** Counts for tests and the count gate. */
export const bridgedStats = (globalThis[Symbol.for("vitest-native.bridged")] ??= {
  evaluations: 0,
  servedFromVite: 0,
  externals: 0,
  failedEvaluations: 0,
  evaluatorRejections: 0,
  cycles: 0,
});

// Vite's SSR transform writes every static import as a statement of its own:
// `const __vite_ssr_import_0__ = await __vite_ssr_import__(` or, for a side-effect import,
// `await __vite_ssr_import__(` at the start of a line. Only those are blanked, so the same
// text inside a string or a comment of the module's own is left as it is.
const IMPORT_AWAIT =
  /((?:^|\n)[ \t]*(?:const __vite_ssr_import_\d+__ = )?)await(\s+__vite_ssr_import__\()/g;
const NODE_MODULES = /[\\/]node_modules[\\/]/;
const DONE = "__vnBridgeDone";

let policy = null;
let roots = null;
/** Inside the directories Vite serves project files from (the main process sends them). */
function inViteRoots(file) {
  roots ??= worker()?.providedContext?.[BRIDGE_PROVIDE_KEY]?.roots ?? [];
  return roots.some((root) => {
    const relative = path.relative(root, file);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}
/**
 * Whether `file` is Vite's to evaluate: inside the directories Vite serves project files
 * from, outside node_modules, and not given to Node by the ownership policy (React Native, detected and explicit packages, RN workspace members).
 * The policy gives project source to Vite, or leaves it to Vitest, which inlines it; the
 * bridge's fetch is Vitest's own, so a file Vitest would externalize comes back
 * externalized and Node loads it, exactly as an import would.
 */
export function isViteOwned(file) {
  if (NODE_MODULES.test(file) || !inViteRoots(file)) return false;
  if (policy === null) {
    // The main process's decisions, from the manifest it wrote into the context: the
    // project's directories, React Native's roots, and the packages Node compiles
    // (detected workspace libraries stay Node's).
    const manifest = parseNativeOwnershipManifest(projectContext()?.ownership);
    policy = createNativeOwnershipPolicy({
      projectRoot: manifest?.projectRoot ?? projectContext()?.projectRoot ?? process.cwd(),
      projectDirs: manifest?.projectDirs ?? [],
      reactNativeRoots: manifest?.reactNativeRoots ?? [],
      ecosystemPackages: manifest?.nodeTransformPackages ?? [],
      serverDepsInlineAll: manifest?.enforcement === "overridden-by-inline-all",
    });
  }
  return policy.decideFile(file).owner !== "node";
}

function contractChanged(what) {
  return new VitestNativeError(
    "BRIDGE_CONTRACT_CHANGED",
    `experimental.ownershipModel 'resolution': ${what} is not where this version of ` +
      `vitest-native expects it in this Vitest version. Turn the option back to 'resolver', ` +
      `and report this, with the Vitest version, as a vitest-native bug.`,
  );
}

/**
 * The mock for an import of `id` (Vite's id for it) made by `importer`, from the engine's
 * mock dispatcher (jest-compat/node-registry.mjs, `channel("mocks").forImport`): the
 * instance the test's own import of it gets, or undefined when no mock applies. One that
 * applies but cannot be had synchronously fails there, by name (MOCK_NOT_SEEN_BY_NODE).
 * Node's require of the file itself never reaches the bridge mocked: under 'resolution'
 * the dispatcher serves Vitest's mocks to Node first (experimental.nodeMocks is implied).
 */
function mockFor(id, importer) {
  const mocks = nodeDispatch().channel("mocks");
  if (typeof mocks.forImport !== "function") return undefined;
  const served = mocks.forImport(id, importer.file ?? importer.id);
  return served === mocks.NONE ? undefined : served;
}

/** A CommonJS module Vite evaluated: its namespace keeps module.exports as `default`. */
const isCommonJsNamespace = (ns) =>
  "value" in (Object.getOwnPropertyDescriptor(ns, "default") ?? {});

/** What Node's `require` gets for Vite's namespace: module.exports for CommonJS. */
export function forRequire(ns) {
  return isCommonJsNamespace(ns) ? ns.default : ns;
}

/**
 * Vite's instance of `file` for Node's `require` from `parent`, evaluating it now if Vite
 * has not: the namespace (or module.exports for CommonJS). `undefined` when Vitest loads
 * the file through Node itself (it is externalized), so Node's own load applies.
 */
export function requireViteOwned(file, parent) {
  const map = evaluatedModules();
  if (typeof map?.getModulesByFile !== "function") throw contractChanged("worker.evaluatedModules");
  for (const node of map.getModulesByFile(file.replace(/\\/g, "/")) ?? []) {
    if (node.id?.startsWith("mock:") || !node.promise) continue;
    // Part-way through Vite's own evaluation, its exports are not finished: served only
    // when this require is a cycle back into that evaluation (knownExports).
    const exports = knownExports(node, null, []);
    bridgedStats.servedFromVite++;
    return forRequire(exports);
  }
  const result = fetchSync(file, parent?.filename, environmentName());
  if ("externalize" in result) return undefined;
  return forRequire(evaluate(result, []));
}

function evaluatingElsewhere(id) {
  return new VitestNativeError(
    "REQUIRE_OF_EVALUATING_VITE_MODULE",
    `experimental.ownershipModel 'resolution': Node's require() reached ${id} while Vite is ` +
      `part-way through evaluating it, and not from inside that evaluation (it is waiting ` +
      `on something else). Returning its unfinished exports would be wrong. Await the ` +
      `import that evaluates it before the code that requires it runs.`,
  );
}

/**
 * The exports of a module Vite's map already has (it has a promise: evaluated, or being
 * evaluated), for an import of it from `importer` (null for Node's require), with
 * Vite's runner's own rules:
 *   - evaluated: its exports, unless its evaluation threw (Vite marks a failed module
 *     evaluated too, and rejects its promise): then the import fails, as Vite's does;
 *   - on this synchronous evaluation's own import chain (`callstack`, then `importer`):
 *     an ES import cycle, so its exports as they are now, as ModuleRunner.cachedRequest
 *     returns them (`callstack.includes(moduleId)`);
 *   - reached from inside its own evaluation, through Node (a Node-loaded module its body
 *     calls requires it, directly or through modules the bridge evaluates): a cycle across
 *     the two module systems, so its exports so far too, as Node and Jest give a require
 *     back into a module still loading (isRunningNow);
 *   - otherwise part-way through an evaluation elsewhere (Vite's own, which is waiting on
 *     something): fails by name. So does a node with a promise and no exports object yet
 *     (Vite's runner awaits createImportMeta between the two; Vitest's sets exports first,
 *     so no code of the test's runs there today).
 */
function knownExports(known, importer, callstack) {
  if (importer) {
    known.importers.add(importer.id);
    importer.imports.add(known.id);
  }
  if (known.evaluated) {
    if (isRejected(known.promise)) throw evaluationFailedEarlier(known);
    return known.exports;
  }
  if (
    known.exports != null &&
    ((importer && [...callstack, importer.id].includes(known.id)) || isRunningNow(known))
  ) {
    bridgedStats.cycles++;
    return known.exports;
  }
  throw evaluatingElsewhere(known.id);
}

/**
 * Whether `node`'s module body is running now: a frame of its file is on the current call
 * stack, or the code running now is what it awaits (V8's async frames). That is when a
 * require of it is a require from inside its evaluation. A CommonJS load is synchronous,
 * so in Node and Jest only code its body calls can reach a module still loading; a timer
 * or another test's code reaching it later is not a cycle. Read from the stack's text, as
 * V8 prints a frame (`at <file>:<line>:<column>`, in parentheses after a function name, or
 * as a `file:` URL), with Error.stackTraceLimit lifted for the one capture: only a module
 * part-way through evaluating pays for it.
 */
function isRunningNow(node) {
  if (typeof node.file !== "string" || !path.isAbsolute(node.file)) return false;
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  let stack;
  try {
    stack = new Error().stack ?? "";
  } finally {
    Error.stackTraceLimit = limit;
  }
  const spellings = [node.file, node.file.replace(/\//g, "\\"), pathToFileURL(node.file).href];
  return spellings.some((file) =>
    new RegExp(`(?:at (?:async )?|\\()${escapeRegExp(file)}:\\d+:\\d+`).test(stack),
  );
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether a promise has rejected, read synchronously. Node has no public API for a
 * promise's state; util.inspect prints it first (`Promise { <rejected> … }`, on a line of
 * its own when the reason is long).
 */
function isRejected(promise) {
  return (
    promise instanceof Promise && /^Promise \{\s*<rejected>/.test(inspect(promise, { depth: 0 }))
  );
}

function evaluationFailedEarlier(known) {
  const error = new VitestNativeError(
    "BRIDGED_EVALUATION_FAILED",
    `experimental.ownershipModel 'resolution': ${known.id} threw when it was evaluated ` +
      `earlier, so Node's require() of it fails too, as another import of it does; its ` +
      `error is the cause.`,
  );
  // Already rejected: the cause is attached in the next microtask, before anything
  // reports this error.
  known.promise.then(undefined, (cause) =>
    Object.defineProperty(error, "cause", { value: cause, configurable: true }),
  );
  return error;
}

/** Node's answer for an external, in the shape Vitest's own external interop gives. */
function externalNamespace(file, importerFile) {
  bridgedStats.externals++;
  // A virtual importer (React Native's facade, `\0virtual:…`) has no file of its own: its
  // externals are required from the project, as Vite's runner imports them with no importer.
  const from =
    typeof importerFile === "string" && path.isAbsolute(importerFile)
      ? importerFile
      : path.join(projectContext()?.projectRoot ?? process.cwd(), "package.json");
  const exports = createRequire(from)(file);
  // An ES module (require(esm)) is already a namespace; so is anything Vitest does not
  // interop (it interops neither .mjs nor a module without `default`).
  if (file.endsWith(".mjs") || Object.prototype.toString.call(exports) === "[object Module]") {
    return exports;
  }
  // As Node's import() of CommonJS shapes it (the namespace Vitest's interop receives):
  // `default` is module.exports, beside its own names (Node finds them statically, with
  // cjs-module-lexer; at run time they are its own enumerable keys).
  const namespace = Object.create(null);
  namespace.default = exports;
  if (exports !== null && (typeof exports === "object" || typeof exports === "function")) {
    for (const key of Object.keys(exports)) {
      if (key === "default") continue;
      Object.defineProperty(namespace, key, { enumerable: true, get: () => exports[key] });
    }
  }
  let mod = namespace;
  let defaultExport = exports;
  if (exports !== null && typeof exports === "object" && exports.__esModule) {
    mod = exports;
    if ("default" in exports) defaultExport = exports.default;
  }
  return new Proxy(mod, {
    get: (target, prop) =>
      prop === "default" ? defaultExport : (target[prop] ?? defaultExport?.[prop]),
    has: (target, prop) =>
      prop === "default"
        ? defaultExport !== undefined
        : prop in target || (defaultExport != null && prop in Object(defaultExport)),
    getOwnPropertyDescriptor: (target, prop) =>
      Reflect.getOwnPropertyDescriptor(target, prop) ??
      (prop === "default" && defaultExport !== undefined
        ? { value: defaultExport, enumerable: true, configurable: true }
        : undefined),
  });
}

/** A static import of a bridged module: Vite's instance, an external, or bridged in turn. */
function loadDependency(dep, importer, callstack) {
  if (Module.isBuiltin(dep)) {
    // A builtin's mock is keyed without the `node:` prefix, as Vitest keys it.
    const mocked = mockFor(dep.startsWith("node:") ? dep.slice("node:".length) : dep, importer);
    return mocked !== undefined ? mocked : externalNamespace(dep, importer.file);
  }
  // A mock applies by Vite's id, which is known from a node Vite's map holds, or else
  // from the fetch (the module's id, or the target of an external), as Vite's runner
  // applies one once it has the module's id.
  const map = evaluatedModules();
  const known = map.getModuleByUrl(dep) ?? map.getModuleById(dep);
  if (known?.promise) {
    const mocked = mockFor(known.id, importer);
    if (mocked !== undefined) return mocked;
    return knownExports(known, importer, callstack);
  }
  const result = fetchExternalOnce(dep, importer);
  const mocked = mockFor("externalize" in result ? result.externalize : result.id, importer);
  if (mocked !== undefined) return mocked;
  if ("externalize" in result) {
    const target = result.externalize.startsWith("file:")
      ? fileURLToPath(result.externalize)
      : result.externalize;
    return externalNamespace(target, importer.file);
  }
  return evaluate(result, [...callstack, importer.id], importer);
}

/**
 * Externalized answers already had, by Vite environment and the URL Vite's transform
 * wrote. Vite resolves an import from its importer before writing it, so two copies of one
 * package are two URLs.
 */
const externals = new Map();

/**
 * Vitest's fetch result for `dep` imported by `importer`. An external's answer does not
 * change within a worker (Vitest decides it by id), so it is asked for once, as Vite's
 * runner keeps its externals: fetches are then the modules evaluated plus the distinct
 * externals, not one per import edge. Modules Vite evaluates are not kept here: Vite's own
 * map holds them once evaluated.
 */
function fetchExternalOnce(dep, importer) {
  const environment = environmentName();
  const key = `${environment}\0${dep}`;
  const held = externals.get(key);
  if (held !== undefined) return held;
  const result = fetchSync(dep, importer.id, environment);
  if ("externalize" in result) externals.set(key, result);
  return result;
}

/**
 * Evaluate a fetched module synchronously with Vitest's own evaluator, in Vite's module
 * map. Throws (by name) when it cannot finish synchronously; on any failure the nodes
 * this call created are invalidated.
 */
function evaluate(result, callstack, importer) {
  const runner = moduleRunner();
  if (typeof runner?.evaluator?.runInlinedModule !== "function") {
    throw contractChanged("the module runner's evaluator");
  }
  const map = evaluatedModules();
  const known = map.getModuleById(result.id);
  // Reached under another URL than the one loadDependency looked up: the same rule.
  if (known?.promise) return knownExports(known, importer, callstack);
  // Everything that can refuse the module is checked before it is put in Vite's map, so
  // a refusal leaves nothing behind (no node waiting on a promise that never settles).
  const file = result.file ?? result.id.replace(/[?#].*$/, "");
  const code = `${result.code.replace(IMPORT_AWAIT, "$1     $2")}\n;__vite_ssr_import_meta__.${DONE} = true;`;
  if (hasTopLevelAwait(code, file)) {
    throw new VitestNativeError(
      "REQUIRE_OF_ASYNC_VITE_MODULE",
      `experimental.ownershipModel 'resolution': ${result.id} has top-level await, so Node's ` +
        `require() cannot wait for it (Node's own require of an ES module refuses it ` +
        `too). Import it from the test before the code that requires it runs.`,
    );
  }
  // As Vite's runner builds it (ModuleRunner.directRequest): Vitest's createImportMeta is
  // synchronous for Node (createNodeImportMeta).
  const createImportMeta = runner.options?.createImportMeta;
  const meta = typeof createImportMeta === "function" ? createImportMeta(file) : null;
  if (meta == null || typeof meta.then === "function") {
    throw contractChanged("the module runner's createImportMeta");
  }

  const mod = map.ensureModule(result.id, result.url);
  if (importer) {
    mod.importers.add(importer.id);
    importer.imports.add(mod.id);
  }
  mod.meta = result;
  const exports = Object.create(null);
  Object.defineProperty(exports, Symbol.toStringTag, {
    value: "Module",
    enumerable: false,
    configurable: false,
  });
  let settle;
  mod.exports = exports;
  mod.evaluated = false;
  mod.promise = new Promise((resolve, reject) => (settle = { resolve, reject }));
  // Rejected only for a module that failed here, where the require already threw by
  // name: counted, not reported a second time as an unhandled rejection.
  mod.promise.catch(() => bridgedStats.failedEvaluations++);

  // A named failure inside a dependency's import: the require fails with it, not with
  // the generic "the module threw" its rethrow would otherwise become.
  let namedFailure = null;
  const context = {
    __vite_ssr_import__: (dep) => {
      try {
        return loadDependency(dep, mod, callstack);
      } catch (error) {
        if (error instanceof VitestNativeError) namedFailure ??= error;
        throw error;
      }
    },
    __vite_ssr_dynamic_import__: (dep) => {
      // Relative to this module, as Vite's own runner resolves a dynamic import.
      let request = String(dep);
      if (request.startsWith(".")) {
        request = path.posix.resolve(path.posix.dirname(mod.url), request);
      }
      return runner.import(request);
    },
    __vite_ssr_exports__: exports,
    // Vite's exportAll (module-runner.js).
    __vite_ssr_exportAll__: (from) => {
      const primitive = from === null || (typeof from !== "object" && typeof from !== "function");
      if (from === exports || primitive || Array.isArray(from)) {
        return;
      }
      if (from instanceof Promise) return;
      for (const key in from) {
        if (key === "default" || key === "__esModule" || key in exports) continue;
        Object.defineProperty(exports, key, {
          enumerable: true,
          configurable: true,
          get: () => from[key],
        });
      }
    },
    __vite_ssr_exportName__: (name, getter) =>
      Object.defineProperty(exports, name, { enumerable: true, configurable: true, get: getter }),
    __vite_ssr_import_meta__: meta,
  };
  const pending = runner.evaluator.runInlinedModule(context, code, mod);
  if (meta[DONE] !== true) {
    fail(mod, settle);
    // The evaluator's promise rejects with the same failure this throws: counted once.
    pending.then(undefined, () => bridgedStats.evaluatorRejections++);
    if (namedFailure !== null) throw namedFailure;
    const error = new VitestNativeError(
      "BRIDGED_EVALUATION_FAILED",
      `experimental.ownershipModel 'resolution': evaluating ${mod.id} for Node's require() ` +
        `threw; its error is the cause.`,
    );
    // The module's own error rejects the evaluator's promise; it is attached as soon as
    // it settles, before anything reports this error.
    pending.then(undefined, (cause) => Object.defineProperty(error, "cause", { value: cause }));
    throw error;
  }
  // Settles after the module ran: its coverage record (moduleExecutionInfo) is final then.
  pending.then(undefined, () => bridgedStats.evaluatorRejections++);
  bridgedStats.evaluations++;
  mod.evaluated = true;
  settle.resolve(exports);
  return exports;
}

/**
 * Whether the module body needs an async function to compile: top-level `await` or
 * `for await`, which cannot finish synchronously. Decided by compiling, not by matching
 * V8's message ("await is only valid…", "Unexpected reserved word"): the body fails as a
 * plain function and compiles as an async one. A body that fails both ways has a syntax
 * error of its own, which the evaluator reports.
 */
function hasTopLevelAwait(code, filename) {
  try {
    vm.compileFunction(`'use strict';{${code}\n}`, [], { filename });
    return false;
  } catch (error) {
    if (!(error instanceof SyntaxError)) return false;
  }
  try {
    const asAsync = new vm.Script(`'use strict';(async()=>{{${code}\n}})`, { filename });
    return asAsync instanceof vm.Script;
  } catch {
    return false;
  }
}

/** A module that could not be evaluated: forgotten, so a later import evaluates it afresh. */
function fail(mod, settle) {
  mod.evaluated = true;
  settle.reject(
    new VitestNativeError(
      "BRIDGED_EVALUATION_FAILED",
      `${mod.id} failed to evaluate through the require bridge`,
    ),
  );
  evaluatedModules().invalidateModule(mod);
}

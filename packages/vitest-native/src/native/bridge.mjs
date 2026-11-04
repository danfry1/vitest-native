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
//                                     runs, so it leaves no partial side effects)
//   BRIDGED_EVALUATION_FAILED         the module threw while evaluating (its error is the
//                                     `cause`); the nodes this evaluation created are
//                                     invalidated, so a later import evaluates afresh
//   REQUIRE_OF_EVALUATING_VITE_MODULE the module is part-way through Vite's own (async)
//                                     evaluation, so its exports are not finished
//   REQUIRE_REACHED_MOCK              a dependency of a bridged module is mocked (served
//                                     once the engine's mock dispatcher is wired in: see
//                                     bridgedMockFor); a mocked or pending file itself is
//                                     left to Node, as without the bridge (leftToNode)
import Module, { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { VitestNativeError } from "../errors.mjs";
import { projectContext } from "../context.mjs";
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
 * Where a mocked dependency of a bridged module would be served. The engine's mock
 * dispatcher (ADR-0007, the next step for this flag) serves it from the same place as
 * Node's `require` of it; until then, a mocked dependency fails by name rather than
 * loading the real module beside the mock.
 */
function bridgedMockFor(dep) {
  const mock = globalThis.__vitest_mocker__?.getDependencyMockByUrl?.(dep);
  if (!mock) return undefined;
  throw new VitestNativeError(
    "REQUIRE_REACHED_MOCK",
    `experimental.ownershipModel 'resolution': ${dep} is mocked, and Node's require() ` +
      `reached it first, before any import ran the mock. Import the module in the test ` +
      `before the code that requires it, or use 'resolver'.`,
  );
}

/**
 * Whether the bridge must step aside for `file` and let Node load it as it does without
 * the flag: the file itself is mocked (the import gets the mock; evaluating the real module
 * into Vite's map would put it under the mocked id), or a `vi.mock`/`vi.doMock` is
 * registered but not resolved yet (which module it names is not known until Vitest's next
 * fetch). Serving these belongs to the engine's mock dispatcher (decision condition 1);
 * until then the require behaves as it does with 'resolver', and a mocked dependency of a
 * bridged module fails by name (bridgedMockFor).
 */
function leftToNode(file, actual) {
  const mocker = globalThis.__vitest_mocker__;
  const pending = mocker?.constructor?.pendingIds;
  if (Array.isArray(pending) && pending.length > 0) return true;
  // jest.requireActual asks for the real module on purpose: Vite's real instance serves it.
  return !actual && Boolean(mocker?.getDependencyMock?.(file.replace(/\\/g, "/")));
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
export function requireViteOwned(file, parent, actual = false) {
  if (leftToNode(file, actual)) return undefined;
  const map = evaluatedModules();
  if (typeof map?.getModulesByFile !== "function") throw contractChanged("worker.evaluatedModules");
  for (const node of map.getModulesByFile(file.replace(/\\/g, "/")) ?? []) {
    if (node.id?.startsWith("mock:") || !node.promise || node.exports == null) continue;
    if (node.evaluated) {
      bridgedStats.servedFromVite++;
      return forRequire(node.exports);
    }
    // Part-way through Vite's own evaluation: its exports are not finished, so a require
    // now fails by name. (A cycle back into that evaluation is the one case where they
    // are the right answer, as in Node and Jest; that is decided separately.)
    throw evaluatingElsewhere(file);
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
  if (Module.isBuiltin(dep)) return externalNamespace(dep, importer.file);
  const mocked = bridgedMockFor(dep);
  if (mocked !== undefined) return mocked;
  const map = evaluatedModules();
  const known = map.getModuleByUrl(dep) ?? map.getModuleById(dep);
  if (known?.promise && known.exports != null) {
    known.importers.add(importer.id);
    importer.imports.add(known.id);
    if (known.evaluated) return known.exports;
    throw evaluatingElsewhere(known.id);
  }
  const result = fetchSync(dep, importer.id, environmentName());
  if ("externalize" in result) {
    const target = result.externalize.startsWith("file:")
      ? fileURLToPath(result.externalize)
      : result.externalize;
    return externalNamespace(target, importer.file);
  }
  return evaluate(result, [...callstack, importer.id], importer);
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
  if (known?.promise && known.exports != null) {
    if (importer) {
      known.importers.add(importer.id);
      importer.imports.add(known.id);
    }
    if (known.evaluated) return known.exports;
    // Reached under another URL than the one loadDependency looked up: the same rule.
    throw evaluatingElsewhere(known.id);
  }
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

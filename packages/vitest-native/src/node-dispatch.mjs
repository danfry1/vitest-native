// One front door for Node's CommonJS loader in a test worker (ADR-0007).
//
// The engine intercepts `Module._load` and `Module._resolveFilename` for several
// reasons: per-file mocks (jest-compat), presets that shadow a package, the
// precompiled React Native registry, the hooks' Metro-style resolution, the
// export-condition recovery and the hot runtime's resolution tracker. Each used to
// wrap Node's function in turn, so the order they were installed in was their
// precedence, and it was written down nowhere but in that order.
//
// Here each hook has one entry, written to `Module` once per worker, when its first
// step is added, and never replaced, and every interceptor is a named step with a fixed rank. A step receives
// `next`, the rest of the chain below it, where it used to call the function it had
// replaced. A request reaches the steps in rank order, outermost first, which is the
// precedence the stacked wrappers had (LOAD_STEPS, RESOLVE_STEPS). A step is built
// from its `next`, so a request costs one call per step, as a wrapper did.
//
// A loader patched after ours (module-alias, pirates, proxyquire) wraps the entry as
// it would any `Module._load`; the entry keeps working beneath it.
import Module from "node:module";
import { VitestNativeTypeError } from "./errors.mjs";

/** `Module._load` steps, outermost first: the precedence of a CommonJS require. */
export const LOAD_STEPS = Object.freeze({
  /** jest-compat's per-file `jest.mock` registry (jest-compat/node-registry.mjs). */
  mocks: 10,
  /** A preset's module shadowing a package (native/hooks.mjs). */
  preset: 20,
  /** The precompiled React Native and library registries (native/registry.mjs). */
  registry: 30,
});

/** `Module._resolveFilename` steps, outermost first. */
export const RESOLVE_STEPS = Object.freeze({
  /** The hot runtime's record of each resolution, for its per-file reset (module-reset.mjs). */
  tracker: 10,
  /** Metro platform resolution, aliases and the resolution memo (native/hooks.mjs). */
  hooks: 20,
  /** A missing `react-native` export target, resolved without it (export-condition-recovery.mjs). */
  recovery: 30,
});

// Per worker, not per module instance: under the hot runtime this file can be
// evaluated more than once in one worker (by Node's loader and by Vite's module
// runner), and there must still be one dispatcher.
const DISPATCH = Symbol.for("vitest-native.node-dispatch");

/**
 * The chain of named steps for the `Module` function `key`. Its entry is written to
 * `Module` when the first step is added, over the function found there (Node's own,
 * unless something wrapped it earlier), so a hook no step uses is left untouched.
 * `run` is rebuilt when the steps change, so a request costs one call per step.
 */
function createChain(key, ranks, install) {
  const steps = [];
  let tail = null;
  const chain = {
    run: null,
    /** When set, answers every request in place of the steps (withResolver). */
    override: null,
    /**
     * When set, wraps Node's own function beneath every step (the load chain's
     * evaluation observer, onNodeEvaluation).
     */
    wrapTail: null,
    /**
     * When set, the next request this hook answers records its result here, and clears
     * it (the resolve chain, for the observed load whose Node resolution this is).
     */
    capture: null,
    /** The function beneath every step: Node's own, as found when the entry was installed. */
    get tail() {
      return tail ?? Module[key];
    },
    /**
     * Add the step named `name`, once: `make(next)` returns the function a request
     * reaches, which calls `next(request, parent, ...rest)` to go on.
     */
    add(name, make) {
      if (!Object.hasOwn(ranks, name)) {
        throw new VitestNativeTypeError(
          "UNKNOWN_DISPATCH_STEP",
          `unknown Node dispatch step: ${name}`,
        );
      }
      if (steps.some((step) => step.name === name)) return false;
      chain.install();
      steps.push({ name, rank: ranks[name], make });
      steps.sort((a, b) => a.rank - b.rank);
      compose();
      return true;
    },
    /** Write this hook's entry to `Module`, once. */
    install() {
      if (tail !== null) return;
      tail = Module[key];
      // Node calls these with three arguments (`_load`) or four (`_resolveFilename`);
      // named parameters keep that call free of a rest array.
      const entry = function (request, parent, isMain, options) {
        const run = chain.override ?? chain.run;
        const capture = chain.capture;
        if (capture !== null) chain.capture = null;
        const result =
          arguments.length > 4
            ? run.apply(this, arguments)
            : run.call(this, request, parent, isMain, options);
        if (capture !== null) capture(result);
        return result;
      };
      compose();
      install(entry);
    },
    /** Rebuild `run`, after `wrapTail` changes. */
    recompose() {
      if (tail !== null) compose();
    },
    /** Remove the step named `name`, if it is installed. */
    remove(name) {
      const at = steps.findIndex((step) => step.name === name);
      if (at === -1) return false;
      steps.splice(at, 1);
      compose();
      return true;
    },
    /** The names of the steps installed, outermost first. */
    get names() {
      return steps.map((step) => step.name);
    },
  };
  function compose() {
    // Node's own function is called as Node calls it, on Module.
    let run = tail.bind(Module);
    if (chain.wrapTail !== null) run = chain.wrapTail(run);
    for (let i = steps.length - 1; i >= 0; i--) run = steps[i].make(run);
    chain.run = run;
  }
  return chain;
}

function createDispatch() {
  // The two writes to Module this file makes, one per hook.
  const load = createChain("_load", LOAD_STEPS, (entry) => {
    Module._load = entry;
  });
  const resolve = createChain("_resolveFilename", RESOLVE_STEPS, (entry) => {
    Module._resolveFilename = entry;
  });
  const observers = new Set();
  // Beneath every load step, while something observes: the module Node's own load
  // created, which is a module Node evaluated. Node resolves the request first (through
  // the resolve chain, which reports the file here) unless its relative-resolve cache
  // already holds it, in which case the module is cached and nothing is new.
  const observe = (node) =>
    function (request, parent, isMain, options) {
      let filename = null;
      let existed = true;
      const capture = (resolved) => {
        filename = resolved;
        existed = typeof resolved !== "string" || Module._cache[resolved] !== undefined;
      };
      resolve.capture = capture;
      let exports;
      try {
        exports = node(request, parent, isMain, options);
      } finally {
        if (resolve.capture === capture) resolve.capture = null;
      }
      if (!existed) {
        const module = Module._cache[filename];
        if (module !== undefined) {
          const event = {
            filename,
            module,
            parent: typeof parent?.filename === "string" ? parent.filename : null,
            via: filename.endsWith(".json")
              ? "json"
              : Object.prototype.toString.call(module.exports) === "[object Module]"
                ? "require-esm"
                : "cjs",
          };
          for (const listener of observers) listener(event);
        }
      }
      return exports;
    };
  return {
    load,
    resolve,
    /**
     * Call `listener({ filename, module, parent, via })` for each module Node's CommonJS
     * loader evaluates through `Module._load`: `filename` is the key Node caches it by
     * (its real path, unless --preserve-symlinks), `parent` the requiring module's
     * filename or null, `via` "cjs", "require-esm" or "json". Not for what a step answers
     * instead of Node (a mock, a preset, the registry), nor for a module already cached.
     * Nor for CommonJS that Node's ESM loader evaluates: a file an `import` reaches, and,
     * on Node 26, the `require`s inside it, which Node resolves without
     * `Module._resolveFilename`. A loader `load` hook sees those (loader.mjs). Returns a
     * function that stops it. Nothing is added to a require while nothing observes.
     */
    onNodeEvaluation(listener) {
      observers.add(listener);
      if (load.wrapTail === null) {
        load.wrapTail = observe;
        load.install();
        resolve.install();
        load.recompose();
      }
      return () => {
        observers.delete(listener);
        if (observers.size === 0 && load.wrapTail !== null) {
          load.wrapTail = null;
          load.recompose();
        }
      };
    },
    /** Node's `Module._load` beneath every step. */
    get nodeLoad() {
      return load.tail;
    },
    /**
     * Run `body` with every resolution answered by `override` instead of the steps:
     * the hot runtime's cache drain, which must reach Node's relative-resolve cache
     * without executing or resolving anything (module-reset.mjs). Needs a resolve step.
     */
    withResolver(override, body) {
      const saved = resolve.override;
      resolve.override = override;
      try {
        return body();
      } finally {
        resolve.override = saved;
      }
    },
  };
}

/** This worker's dispatcher, installed on first use. */
export function nodeDispatch() {
  return (globalThis[DISPATCH] ??= createDispatch());
}

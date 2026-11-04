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
     * When set, the next request from `capture.parent` this hook answers records its
     * file here, once (the resolve chain, for an observed load's own resolution).
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
        const captured = capture !== null && !capture.done && capture.parent === parent;
        if (captured) capture.done = true;
        const result =
          arguments.length > 4
            ? run.apply(this, arguments)
            : run.call(this, request, parent, isMain, options);
        if (captured) {
          capture.filename = result;
          const held = typeof result === "string" ? Module._cache[result] : undefined;
          capture.loadedBefore = held !== undefined && held.loaded === true;
        }
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
  const evaluations = new Set();
  const loads = new Set();
  // Beneath every load step, while something observes: Node's own load of a request.
  // Node resolves it first, through the resolve chain, which reports the file to this
  // load's capture (from the same parent, once) unless Node's relative-resolve cache
  // already answers it. A module that was not loaded before and is after is one Node
  // evaluated: new, or a placeholder Node's ESM loader cached for a file an `import`
  // reached. One still loading (a circular require) is not reported.
  const observe = (node) =>
    function (request, parent, isMain, options) {
      const capture = { parent, done: false, filename: null, loadedBefore: true };
      resolve.capture = capture;
      let exports;
      try {
        exports = node(request, parent, isMain, options);
      } finally {
        // Node resolves a load before it evaluates it, so a capture a nested load
        // replaced is either taken or never will be: nothing is restored.
        resolve.capture = null;
      }
      const { filename } = capture;
      if (typeof filename !== "string") return exports;
      if (loads.size > 0) {
        report(loads, { request, parent: parent ?? null, filename });
      }
      if (!capture.loadedBefore && evaluations.size > 0) {
        const module = Module._cache[filename];
        if (module !== undefined && module.loaded === true) {
          report(evaluations, {
            filename,
            module,
            parent: typeof parent?.filename === "string" ? parent.filename : null,
            via: filename.endsWith(".json")
              ? "json"
              : Object.prototype.toString.call(module.exports) === "[object Module]"
                ? "require-esm"
                : "cjs",
          });
        }
      }
      return exports;
    };
  // Every listener hears it; the first to throw makes the require throw, after them all.
  const report = (listeners, event) => {
    let failure;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure !== undefined) throw failure.error;
  };
  const observing = () => {
    const on = evaluations.size > 0 || loads.size > 0;
    if (on === (load.wrapTail !== null)) return;
    load.wrapTail = on ? observe : null;
    if (on) {
      load.install();
      resolve.install();
    }
    load.recompose();
  };
  const subscribe = (set, listener) => {
    set.add(listener);
    observing();
    return () => {
      set.delete(listener);
      observing();
    };
  };
  const channels = new Map();
  return {
    load,
    resolve,
    /**
     * The object named `name`, one per worker, created empty on first use: a channel the
     * engine's code reaches from wherever it runs (Vite's module runner, Node's loaders,
     * the in-thread loader hooks) through this dispatcher, rather than through a global
     * of its own. The ownership ledger's is "ownership".
     */
    channel(name) {
      let channel = channels.get(name);
      if (channel === undefined) channels.set(name, (channel = {}));
      return channel;
    },
    /**
     * Call `listener({ filename, module, parent, via })` for each module Node's CommonJS
     * loader evaluates through `Module._load`: `filename` is the key Node caches it by
     * (its real path, unless --preserve-symlinks), `parent` the requiring module's
     * filename or null, `via` "cjs", "require-esm" or "json". This includes a file an
     * `import` reached, which Node's ESM loader caches unloaded and evaluates through
     * `Module._load`. Not for what a step answers instead of Node (a mock, a preset, the
     * registry), nor for a module already loaded, nor for a load Node resolves without
     * `Module._resolveFilename` (a resolve hook that short-circuits it). A listener that throws makes
     * the require throw, after every listener has heard it. Returns a function that stops
     * it. Nothing is added to a require while nothing observes.
     */
    onNodeEvaluation(listener) {
      return subscribe(evaluations, listener);
    },
    /**
     * Call `listener({ request, parent, filename })` for each request Node's own load
     * resolves: `request` as `Module._load` received it and `parent` the requiring
     * module, which is how Node's relative-resolve cache keys it (whatever a resolver
     * wrapped around this dispatcher made of the request), and `filename` the file it
     * resolved. For the hot runtime's cache drain (module-reset.mjs). Returns a function
     * that stops it.
     */
    onNodeLoad(listener) {
      return subscribe(loads, listener);
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

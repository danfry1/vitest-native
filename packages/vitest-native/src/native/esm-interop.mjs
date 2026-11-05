// The interop a compiled ES module's default and namespace imports get. Its own module
// so both sides of the native engine's transform use it: transform.mjs keys the cache on
// it, and Babel, on its own thread (babel-toolchain.mjs), runs the plugin.
/**
 * The default import an ES module gets from what it imports, once it is compiled to
 * CommonJS: the module's `default` export when it is a compiled ES module that has one,
 * otherwise the whole `module.exports`.
 *
 * Why it is needed. Every ESM-goal file the engine compiles runs as CommonJS (see
 * needsTransform in transform.mjs), through the preset's
 * @babel/plugin-transform-modules-commonjs with Babel's default interop, which reads
 * `exports.default` from any module that sets `__esModule`. Node gives an ES module importing CommonJS the whole `module.exports` as
 * its default ("When importing CommonJS modules, the module.exports object is provided
 * as the default export", Node's ESM docs, "Interoperability with CommonJS"), and
 * packages that ship an ESM wrapper for Node rely on it. tslib's `modules/index.js`,
 * which its `exports['.'].import.node` condition selects (tslib 2.8.1), is
 * `import tslib from '../tslib.js'` over a CommonJS file that sets `__esModule` and has
 * no `default`. A project that imports `tslib` while tslib is in the compile set had
 * that wrapper compiled, and Babel's interop gave it `undefined`: "Cannot read
 * properties of undefined (reading '__extends')".
 *
 * Why this rule and not Node's exactly. Node gives `module.exports` even when the target
 * is Babel-compiled CommonJS with `__esModule` and a real `exports.default`, which is
 * common in the React Native ecosystem: its libraries are written against Metro's Babel
 * interop and expect that default. Switching to Node's rule would change what those
 * imports have resolved to under this engine so far, and what Metro gives the same code.
 * The rule here keeps every case where Babel's interop finds a `default` and takes
 * Node's answer only where Babel's would be `undefined`, which is never what an import
 * meant. The precedent for keeping the default is Metro and Babel, which apply their
 * interop whatever the file's module goal; a bundler in Node mode (Rolldown for `.mjs`
 * or `type: module`) gives `module.exports` here, as Node does.
 *
 * An ES module the engine compiled is not CommonJS to the importer. Its output marks
 * its exports with a non-enumerable `Symbol.for(ESM_EXPORTS_MARK)` (set first, so a
 * cycle sees it), and a marked module, or a real namespace Node's require(esm) returns,
 * gets Babel's interop unchanged: no synthetic default for one that has none, as Node
 * gives `undefined` for it. `__esModule` alone cannot tell the two apart, since
 * TypeScript's and Babel's CommonJS set it too.
 *
 * The decision is made when the default is READ, not when the module is required, as
 * Babel's own interop reads `exports.default` at use time:
 * - in an import cycle, TypeScript's CommonJS output sets `exports.default` after the
 *   require that cycles back, so "no default yet" at require time is not "no default";
 * - a module served by a Proxy (preset subpaths, some libraries) answers `default` from
 *   its `get` trap, which neither `hasOwnProperty` nor `in` sees; reading it does.
 * A module counts as having a default when reading `default` gives a value or `default`
 * is a key of it (an explicit `exports.default = undefined` stays undefined, as Babel's).
 * One effect remains in a cycle: a default read at the top level while the target is
 * still half-initialised gets `module.exports`, where Babel's interop gave `undefined`.
 *
 * Every form Babel compiles to these two helpers gets the rule: a default import and
 * `export { default } from` (interopRequireDefault), and a default import beside named
 * ones and `import * as ns` (`ns.default`) (interopRequireWildcard). When the target has
 * its default, or is a marked ES module, both helpers return the module itself, exactly
 * as Babel's do. Otherwise the default import gets a wrapper whose `default` is read
 * lazily, and the namespace is a copy whose members are getters over the module (live
 * bindings, the module's own enumerable keys) plus a non-enumerable lazy `default`.
 * Plain CommonJS gets Babel's own wildcard copy. Namespaces are cached per module in one
 * runtime shared by every compiled file (ESM_INTEROP_RUNTIME on globalThis), so two
 * files importing one module get one namespace object, as under Node.
 *
 * Rejected:
 * - Choosing interop per import by RESOLVING the target at compile time
 *   (modules-commonjs' `importInterop` as a function: "node" for a CommonJS target,
 *   "babel" for an ES one). The compiled `require()` resolves under the `require`
 *   condition, not the `import` one the decision would naturally use (for tslib those
 *   are different files), and the output would then depend on other packages' manifests
 *   and files, which the content-keyed cache does not see: a dependency changing its
 *   `type` would be served stale output. Deciding at run time, on the object the
 *   require() actually returned, needs neither.
 * - Deciding once, at require time, on `hasOwnProperty(e, "default")` (this change's
 *   first version): wrong forever after for a module required mid-cycle, and wrong for
 *   a Proxy-served module, as above.
 * - A Proxy over the module as the namespace: keys added after the import would show,
 *   but every member access costs a trap (~15 ns against ~4 ns for a getter), and a
 *   per-file cache gave each importing file its own namespace object.
 * - Not compiling valid ESM-goal files and letting Node load them as ES modules. That
 *   is the eventual direction (see the NOTE in ecosystem.ts), but it moves those files
 *   out of the CommonJS loader the engine's ownership and preset redirects run through,
 *   and changes named exports and live bindings: a much larger change than this bug.
 *
 * Mechanism: Babel builds every helper through the file's `helperGenerator` when one is
 * set (@babel/core lib/transformation/file/file.js, _addHelper), which is how
 * @babel/plugin-transform-runtime points helpers at @babel/runtime. It installs that in
 * its `pre` hook, and every plugin's `pre` runs before traversal starts, so this wraps
 * it at Program entry and answers the two interop helpers. modules-commonjs asks for
 * them at Program exit, lazy or not. The helpers are declared once per file, the first
 * time either is asked for, as Babel declares its own inline helpers, and forward to the
 * shared runtime.
 */
/** Marks the exports of a file the engine compiled from an ES module (non-enumerable). */
export const ESM_EXPORTS_MARK = "vitest-native.esm";
/** Where the shared interop runtime lives on globalThis; the suffix is its revision. */
export const ESM_INTEROP_RUNTIME = "vitest-native.esmInterop.2";

// One runtime per realm, installed by the first compiled file that needs it, so every
// file shares one namespace cache (a CommonJS module is one namespace object for every
// importer, as in Node). It is source text because each compiled file carries the
// installer: compiled package files cannot rely on resolving vitest-native itself.
const ESM_INTEROP_RUNTIME_SOURCE = `function () {
  var key = Symbol.for(${JSON.stringify(ESM_INTEROP_RUNTIME)});
  var runtime = globalThis[key];
  if (runtime) return runtime;
  var mark = Symbol.for(${JSON.stringify(ESM_EXPORTS_MARK)});
  var hasOwn = Object.prototype.hasOwnProperty;
  var namespaces = new WeakMap();
  var nodeNamespaces = new WeakMap();
  function isEsm(e) {
    return e[mark] === true || Object.prototype.toString.call(e) === "[object Module]";
  }
  function hasDefault(e) {
    return isEsm(e) || "default" in e;
  }
  function defaultOf(e) {
    var d = e.default;
    return d === undefined && !("default" in e) ? e : d;
  }
  function getter(f, e, k) {
    Object.defineProperty(f, k, {
      enumerable: true,
      configurable: true,
      get: function () { return e[k]; },
    });
  }
  runtime = {
    interopDefault: function (e) {
      if (!e || !e.__esModule) return { default: e };
      if (hasDefault(e)) return e;
      return { get default() { return defaultOf(e); } };
    },
    interopWildcard: function (e, t) {
      if (e === null || (typeof e != "object" && typeof e != "function")) {
        return { __proto__: null, default: e };
      }
      var lazy = !t && !!e.__esModule;
      if (lazy && hasDefault(e)) return e;
      var cache = t ? nodeNamespaces : namespaces;
      if (cache.has(e)) return cache.get(e);
      var f = { __proto__: null };
      for (var k in e) {
        if (k === "default" || !hasOwn.call(e, k)) continue;
        if (lazy) getter(f, e, k);
        else {
          var i = Object.getOwnPropertyDescriptor(e, k);
          if (i && (i.get || i.set)) Object.defineProperty(f, k, i);
          else f[k] = e[k];
        }
      }
      if (lazy) {
        Object.defineProperty(f, "default", { get: function () { return defaultOf(e); } });
      } else f.default = e;
      cache.set(e, f);
      return f;
    },
  };
  Object.defineProperty(globalThis, key, { value: runtime, configurable: true });
  return runtime;
}`;

const ESM_INTEROP_HELPERS = ({ def, wild, runtime }) => `
function ${def}(e) {
  return ${runtime}().interopDefault(e);
}
function ${wild}(e, t) {
  return ${runtime}().interopWildcard(e, t);
}
function ${runtime}() {
  return (${ESM_INTEROP_RUNTIME_SOURCE})();
}
`;

export function esmImportInterop({ template, types: t }) {
  return {
    name: "vitest-native-esm-import-interop",
    // The mark goes first in the body, after modules-commonjs has written its requires
    // (`post` runs once every visitor is done), so a cycle that reaches this file while
    // its requires run already sees it.
    post(file) {
      file.path.unshiftContainer(
        "body",
        template.statement.ast(
          `Object.defineProperty(exports, Symbol.for(${JSON.stringify(ESM_EXPORTS_MARK)}), { value: true });`,
        ),
      );
    },
    visitor: {
      Program: {
        enter(_, state) {
          const file = state.file;
          const next = file.get("helperGenerator");
          let ids = null;
          const declare = () => {
            if (ids) return ids;
            const uid = (hint) => file.scope.generateUidIdentifier(hint);
            ids = {
              def: uid("esmInteropDefault"),
              wild: uid("esmInteropWildcard"),
              runtime: uid("esmInteropRuntime"),
            };
            const names = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, id.name]));
            const nodes = template.statements.ast(ESM_INTEROP_HELPERS(names));
            for (const node of nodes) node._compact = true;
            for (const added of file.path.unshiftContainer("body", nodes))
              file.scope.registerDeclaration(added);
            return ids;
          };
          file.set("helperGenerator", (name) => {
            if (name === "interopRequireDefault") return t.cloneNode(declare().def);
            if (name === "interopRequireWildcard") return t.cloneNode(declare().wild);
            return next?.(name);
          });
        },
      },
    },
  };
}

// Jest-style CommonJS interop for jest.mock factory return values.
//
// Jest treats a `jest.mock('m', factory)` factory's return as CommonJS
// `module.exports`, then resolves a default import via `_interopRequireDefault`:
//   import X from 'm'        →  exports.__esModule ? exports.default : exports
//   import { a } from 'm'    →  exports.a
//
// Vitest instead treats the factory return as an ES-module namespace, so a
// default import only sees a literal `default` key. That breaks the two most
// common Jest manual-mock shapes:
//   jest.mock('m', () => Component)        // a function/component, no object
//   jest.mock('m', () => ({ a, b }))       // named-only, consumed as `import X from`
//
// jestMockTransform wraps each jest.mock/doMock factory so its return passes
// through this — reproducing Jest's interop while leaving genuinely ES-shaped
// returns (those with `__esModule` or an explicit `default`) untouched.
export function jestMockInterop(mod) {
  if (mod == null) return mod;
  // An async factory — or any factory returning a promise — resolves to the module
  // shape, so interop applies to the resolved value. Vitest awaits a factory result,
  // so handing the promise back is enough. Without this the promise itself fell into
  // the object branch below, where it has no own enumerable keys and no `default`,
  // producing `{ default: Promise }`: every named export vanished and Vitest reported
  // `No "x" export is defined on the mock` about a vi.mock the author never wrote.
  //
  // Tested by tag rather than by a `then` method: a module may legitimately export a
  // function named `then`, and awaiting that calls it with (resolve, reject) and never
  // settles — a hung test file, which is worse than the bug this fixes. The tag holds
  // for native promises from any realm, and `async` functions and `Promise.resolve`
  // only ever produce those.
  if (Object.prototype.toString.call(mod) === "[object Promise]") {
    return mod.then(jestMockInterop);
  }
  const t = typeof mod;
  if (t === "object" || t === "function") {
    // Already ES-shaped — respect the author's/real module's default export.
    if (mod.__esModule || "default" in mod) return missingExportsUndefined(mod);
    // CJS exports: a default import receives the whole module (object or
    // function); named imports keep working off its keys (object props / fn
    // statics).
    return missingExportsUndefined(withDefault(mod));
  }
  // Primitive export (rare): expose as default.
  return missingExportsUndefined({ default: mod });
}

/**
 * The module's own enumerable properties plus `default: mod` — what `{ ...mod,
 * default: mod }` produced, except that an accessor is not read until it is imported.
 *
 * A spread reads every property, so it ran each getter while the factory was being
 * evaluated. Jest reads a property only when the code under test does. The difference
 * is visible because a factory runs during the hoisted imports, before the test file's
 * own `let`/`const` bindings are initialised:
 *
 *   let mockIsWeb = false
 *   jest.mock('#/env', () => ({ get IS_WEB() { return mockIsWeb } }))
 *
 * passes under Jest, where `IS_WEB` is read later, and threw `Cannot access
 * 'mockIsWeb' before initialization` here. It also froze the value: a test changing
 * `mockIsWeb` was never seen.
 *
 * An accessor is therefore forwarded to the module on each access, `mod[key]`, which
 * is what an importer reads in Jest: the getter runs with the module as `this`, and a
 * module that is itself a proxy — `jest.requireActual('react-native')` returns one,
 * whose overrides live in its `get` trap — is read through that proxy. It also keeps
 * React Native's lazy getters lazy when a factory returns the whole module, where the
 * spread evaluated every one of them. Data properties are read the way the spread
 * read them and stay plain writable copies.
 */
function withDefault(mod) {
  const ns = {};
  for (const key of Reflect.ownKeys(mod)) {
    const descriptor = Object.getOwnPropertyDescriptor(mod, key);
    if (!descriptor?.enumerable) continue;
    if ("value" in descriptor) {
      ns[key] = mod[key];
    } else {
      Object.defineProperty(ns, key, {
        get: () => mod[key],
        set: (value) => {
          mod[key] = value;
        },
        enumerable: true,
        configurable: true,
      });
    }
  }
  ns.default = mod;
  return ns;
}

/**
 * Report every string key as present, so an import the factory did not provide is
 * `undefined`, as in Jest, instead of an error.
 *
 * Jest hands the factory's return to the importer as `module.exports`, and Babel's
 * CommonJS output reads a named import as a property of it (`_m.applicationId`): a
 * name the factory left out is simply `undefined`. Vitest instead wraps the factory
 * result in a proxy (VitestMocker#callFunctionMock, the same in Vitest 4 and 5) whose
 * `get` throws `No "x" export is defined on the "m" mock` when `!(prop in target)`.
 * Mocking only what a test needs is ordinary in Jest suites, so a migrated suite
 * failed on imports its tests never touched.
 *
 * `in` against this proxy is true for any string key, which satisfies that check; the
 * value is still read from the module (`undefined` when absent). Nothing else changes:
 * keys, descriptors and spreading see only the real members. `then` is excluded so the
 * module never looks like a thenable to code that tests for one with `in`, and symbols
 * are excluded because Vitest already exempts the well-known ones. The one visible
 * difference from Jest is that `'x' in module` is true for a missing `x`.
 *
 * Only factories passed through jestMockTransform reach this; a `vi.mock` factory
 * keeps Vitest's strict check.
 */
function missingExportsUndefined(ns) {
  return new Proxy(ns, {
    has: (target, key) => (typeof key === "string" && key !== "then") || Reflect.has(target, key),
  });
}

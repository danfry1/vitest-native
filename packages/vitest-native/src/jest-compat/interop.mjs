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
    if (mod.__esModule || "default" in mod) return mod;
    // CJS exports: a default import receives the whole module (object or
    // function); named imports keep working off its keys (object props / fn
    // statics). `{ ...mod }` copies own enumerable props for the named side.
    return { ...mod, default: mod };
  }
  // Primitive export (rare): expose as default.
  return { default: mod };
}

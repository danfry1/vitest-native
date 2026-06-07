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

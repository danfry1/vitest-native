import type { Plugin } from "vite";
import MagicString from "magic-string";

// Hoistable jest mock methods (Vitest only hoists these on the vi/vitest object).
const HOISTABLE = new Set(["mock", "unmock", "doMock", "doUnmock"]);
// The ones that take a factory whose return needs Jest-style CJS interop.
const WITH_FACTORY = new Set(["mock", "doMock"]);
const TRANSFORMABLE = /\.(?:[cm]?[jt]sx?)$/;
// Cheap pre-filter so we only parse files that actually use jest mock calls.
const HAS_JEST_MOCK = /\bjest\s*\.\s*(?:mock|unmock|doMock|doUnmock)\s*\(/;

/** Visit every node in an ESTree AST (depth-first), calling `fn` on each. */
function walk(node: any, fn: (n: any) => void): void {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const key in node) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === "string") walk(c, fn);
    } else if (child && typeof child.type === "string") {
      walk(child, fn);
    }
  }
}

/**
 * Vite plugin that adapts a Jest suite's `jest.mock(...)` calls for Vitest:
 *
 * 1. **Hoisting** — rewrites the `jest` object of `jest.mock`/`unmock`/`doMock`/
 *    `doUnmock` to `vi`, so Vitest's hoister (which only recognises `vi`/`vitest`)
 *    lifts them above the imports. Without this a top-level `jest.mock(...)` runs
 *    after imports and silently doesn't apply.
 *
 * 2. **CJS interop** — wraps each `jest.mock`/`doMock` factory so its return value
 *    passes through Jest's `_interopRequireDefault` semantics (see interop.mjs).
 *    Jest treats the factory return as `module.exports`; Vitest treats it as an ES
 *    namespace. This bridges the two common Jest shapes that otherwise break:
 *      jest.mock('m', () => Component)     // Vitest: "not returning an object"
 *      jest.mock('m', () => ({ a, b }))    // Vitest: default import is undefined
 *    A factory already returning an ES shape (`__esModule`/explicit `default`) is
 *    passed through unchanged.
 *
 * Opt-in: add after `reactNative()`; pair with `jestCompatSetup` + `globals: true`.
 */
export function jestMockTransform(): Plugin {
  return {
    name: "vitest-native:jest-mock-hoist",
    // No `enforce` (normal order): this must run AFTER Vite's esbuild strips
    // TS/JSX (so `this.parse`, which is acorn, gets plain JS) but BEFORE Vitest's
    // enforce:post `vitest:mocks` hoister. enforce:'pre' would see raw TSX and fail
    // to parse; enforce:'post' could run after the hoister.
    transform(code: string, id: string) {
      if (id.includes("/node_modules/")) return null;
      const file = id.split("?")[0];
      if (!TRANSFORMABLE.test(file)) return null;
      if (!HAS_JEST_MOCK.test(code)) return null;

      let ast: any;
      try {
        ast = this.parse(code);
      } catch {
        return null; // let the normal pipeline surface the syntax error
      }

      const s = new MagicString(code);
      let changed = false;

      walk(ast, (node) => {
        if (node.type !== "CallExpression") return;
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression" || callee.computed) return;
        const obj = callee.object;
        const prop = callee.property;
        if (!obj || obj.type !== "Identifier" || obj.name !== "jest") return;
        if (!prop || prop.type !== "Identifier" || !HOISTABLE.has(prop.name)) return;

        // jest.<method> → vi.<method>
        s.overwrite(obj.start, obj.end, "vi");
        changed = true;

        // Wrap a function factory so its return is run through Jest CJS interop.
        if (WITH_FACTORY.has(prop.name) && node.arguments.length >= 2) {
          const factory = node.arguments[1];
          if (
            factory.type === "ArrowFunctionExpression" ||
            factory.type === "FunctionExpression"
          ) {
            s.appendLeft(factory.start, "() => globalThis.__vnInteropMock((");
            s.appendRight(factory.end, ")())");
          }
        }
      });

      if (!changed) return null;
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
  };
}

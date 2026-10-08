import type { Plugin } from "vite";
import { MagicString } from "magic-string";

// Hoistable jest mock methods (Vitest only hoists these on the vi/vitest object).
const HOISTABLE = new Set(["mock", "unmock", "doMock", "doUnmock"]);
// The ones that take a factory whose return needs Jest-style CJS interop.
const WITH_FACTORY = new Set(["mock", "doMock"]);
// The ones that remove a mock, which the Node-side registry must forget too.
const UNMOCK = new Set(["unmock", "doUnmock"]);
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
 * 3. **One registry** — registers each factory, and each unmock, with the Node-side
 *    registry the jest-compat setup installs, so `require()`, the modules
 *    `jest.requireActual` loads, and `jest.requireMock` see the same mock the imports
 *    do, as under Jest's single per-file module registry (see node-registry.mjs).
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
      // Statements at the top level, where a registration can be hoisted beside them.
      const topLevel = new Map<any, any>();
      for (const statement of ast.body) {
        if (statement.type === "ExpressionStatement") topLevel.set(statement.expression, statement);
      }
      // Factories already replaced, whose source must not be edited again.
      const replaced: [number, number][] = [];

      walk(ast, (node) => {
        if (node.type !== "CallExpression") return;
        if (replaced.some(([start, end]) => node.start >= start && node.end <= end)) return;
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression" || callee.computed) return;
        const obj = callee.object;
        const prop = callee.property;
        if (!obj || obj.type !== "Identifier" || obj.name !== "jest") return;
        if (!prop || prop.type !== "Identifier" || !HOISTABLE.has(prop.name)) return;

        // jest.<method> → vi.<method>
        s.overwrite(obj.start, obj.end, "vi");
        changed = true;

        // The module specifier, when it is a string literal or a variable: it is
        // repeated in the registration below, and repeating an arbitrary expression
        // would evaluate it twice.
        const specNode = node.arguments[0];
        const spec =
          specNode &&
          ((specNode.type === "Literal" && typeof specNode.value === "string") ||
            (specNode.type === "TemplateLiteral" && specNode.expressions.length === 0) ||
            specNode.type === "Identifier")
            ? code.slice(specNode.start, specNode.end)
            : null;

        if (WITH_FACTORY.has(prop.name) && node.arguments.length >= 2) {
          const factory = node.arguments[1];
          if (factory.type === "ArrowFunctionExpression" || factory.type === "FunctionExpression") {
            if (spec !== null) {
              // Registered where Vitest hoists the call (see node-registry.mjs).
              const register = `globalThis.__vnJestMock?.(import.meta.url, ${spec}, ${code.slice(factory.start, factory.end)})`;
              const lookup = `() => globalThis.__vnJestMocked(import.meta.url, ${spec})`;
              const statement = topLevel.get(node);
              if (prop.name === "mock" && statement) {
                // Vitest 5's prewarmModuleGraph skips a mocked module's graph only
                // when the second argument is an inline function (@vitest/mocker
                // hoistMocks: `hasFactory`), so the registration goes in a vi.hoisted
                // beside it, which Vitest hoists in source order.
                s.prependLeft(statement.start, `vi.hoisted(() => ${register});\n`);
                s.overwrite(factory.start, factory.end, lookup);
              } else {
                s.overwrite(factory.start, factory.end, `(${register}, ${lookup})`);
              }
              replaced.push([factory.start, factory.end]);
            } else {
              // Wrap a function factory so its return is run through Jest CJS interop.
              s.appendLeft(factory.start, "() => globalThis.__vnInteropMock((");
              s.appendRight(factory.end, ")())");
            }
          }
        } else if (UNMOCK.has(prop.name) && spec !== null) {
          // Unregister at the same position, so a later require() is unmocked too.
          s.appendLeft(specNode.start, `(globalThis.__vnJestUnmock?.(import.meta.url, ${spec}), `);
          s.appendRight(specNode.end, ")");
        }
      });

      if (!changed) return null;
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
  };
}

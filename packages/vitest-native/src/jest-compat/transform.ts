import type { Plugin } from "vite";
import path from "node:path";
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

// The globals the setup installs, reached through one hoisted accessor per file. A run
// without the setup otherwise failed inside a mock factory with "__vnJestMocked is not
// a function". The error is VitestNativeError by shape (name and code), which is how
// errors.mjs identifies one: generated code cannot import that module.
const SETUP = "__vn_jest_compat__";
/** Prepended to a file whose mock factories use the setup. Exported for tests. */
export const SETUP_ACCESSOR =
  `const ${SETUP} = vi.hoisted(() => (name) => {\n` +
  `  if (typeof globalThis[name] === "function") return globalThis[name];\n` +
  `  throw Object.assign(new Error("[vitest-native] jest.mock() factories need the jest-compat setup, which this test run does not load. " +\n` +
  `    "Add jestCompatSetup from 'vitest-native/jest-compat' to test.setupFiles, ahead of any setup file that calls jest.mock()."),\n` +
  `    { name: "VitestNativeError", code: "JEST_COMPAT_SETUP_MISSING" });\n` +
  `});\n`;

/**
 * Visit every node in an ESTree AST (depth-first), calling `fn` on each. Returning
 * `false` from `fn` skips that node's children.
 */
function walk(node: any, fn: (n: any) => boolean | void): void {
  if (!node || typeof node.type !== "string") return;
  if (fn(node) === false) return;
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

// `jest.requireActual` of project source, inside a factory's own body.
//
// The canonical Jest partial mock is
//
//   jest.mock('./api', () => ({ ...jest.requireActual('./api'), other: jest.fn() }))
//
// `requireActual` at run time is synchronous, so it loads through Node. Node reuses
// Vite's instance of a module only when Vite has already evaluated it in this file
// (viteInstanceOf in node-registry.mjs); otherwise it compiles a second copy. The real
// `read` in the mock then reads Node's copy of a store that the app, imported through
// Vite, writes into its own copy — silently, and only in some import orders.
//
// So, where the call can wait, it goes through Vite instead: the factory becomes async
// and the call `(await vi.importActual(spec))`, and the actual module shares Vite's
// graph with the rest of the file. The original, synchronous factory is registered
// beside it for a Node-side load (`require()`, `jest.requireMock`) that comes before
// any import has run the async one, which keeps today's behaviour there instead of
// handing Node a promise (node-registry.mjs, `valueOf`).
//
// Only what Vite owns is rewritten: a specifier Vite resolves to a source file outside
// node_modules. That covers relative and absolute paths and every alias Vite applies
// (string, regex, tsconfig paths) without restating Vite's alias rules here. A package
// keeps the Node load: presets shadow packages by name there (native/hooks.mjs). Calls
// in nested functions run after the factory has returned, where nothing can be
// awaited, and stay synchronous.
//
// Rejected: making the synchronous call itself return Vite's instance. Vite's module
// runner evaluates asynchronously, so a module it has not reached cannot be produced
// from inside a synchronous call; the remaining option, handing Node's copy to Vite's
// later imports, would make Node the owner of project source that Vite transforms and
// mocks, where every module has one owner (native/ownership.mjs).
const FUNCTION = new Set(["FunctionExpression", "ArrowFunctionExpression", "FunctionDeclaration"]);
const NODE_MODULES = /[\\/]node_modules[\\/]/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/** The string specifier of a `jest.requireActual('<literal>')` call, or null. */
function requireActualSpec(node: any): string | null {
  if (node.type !== "CallExpression" || node.arguments.length !== 1) return null;
  const callee = node.callee;
  if (callee?.type !== "MemberExpression" || callee.computed) return null;
  if (callee.object?.type !== "Identifier" || callee.object.name !== "jest") return null;
  if (callee.property?.type !== "Identifier" || callee.property.name !== "requireActual") {
    return null;
  }
  const arg = node.arguments[0];
  if (arg.type === "Literal" && typeof arg.value === "string") return arg.value;
  if (arg.type === "TemplateLiteral" && arg.expressions.length === 0) {
    return arg.quasis[0].value.cooked ?? null;
  }
  return null;
}

/**
 * The `jest.requireActual` calls a factory makes while it runs: those in its own body,
 * not in a nested function or a class body (where `await` is not allowed either).
 */
function ownRequireActualCalls(factory: any): { node: any; spec: string }[] {
  const calls: { node: any; spec: string }[] = [];
  walk(factory.body, (node) => {
    if (FUNCTION.has(node.type) || node.type === "ClassBody") return false;
    const spec = requireActualSpec(node);
    if (spec !== null) calls.push({ node, spec });
  });
  return calls;
}

/** Whether a resolveId result is a source file Vite evaluates itself. */
function isViteOwnedSource(resolved: { id: string; external?: unknown } | null): boolean {
  if (!resolved || resolved.external) return false;
  const file = resolved.id.split("?")[0];
  return (
    !file.startsWith("\0") &&
    path.isAbsolute(file) &&
    !NODE_MODULES.test(file) &&
    SOURCE_FILE.test(file)
  );
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

      // The factories' own `jest.requireActual` calls, which may move to Vite. Resolving
      // them is asynchronous, so a file without any is transformed synchronously.
      const candidates = new Map<any, { node: any; spec: string }[]>();
      walk(ast, (node) => {
        const factory = mockFactoryOf(node);
        if (!factory || factory.generator) return;
        const calls = ownRequireActualCalls(factory);
        if (calls.length > 0) candidates.set(factory, calls);
      });
      if (candidates.size === 0) return rewrite(code, ast, new Map());

      const specs = new Set([...candidates.values()].flat().map((call) => call.spec));
      return Promise.all(
        [...specs].map(async (spec) => {
          try {
            return [spec, isViteOwnedSource(await this.resolve(spec, id))] as const;
          } catch {
            return [spec, false] as const; // unresolvable: leave it to requireActual's error
          }
        }),
      ).then((resolved) => {
        const owned = new Set(resolved.filter(([, yes]) => yes).map(([spec]) => spec));
        const toAsync = new Map<any, any[]>();
        for (const [factory, calls] of candidates) {
          const moved = calls.filter((call) => owned.has(call.spec)).map((call) => call.node);
          if (moved.length > 0) toAsync.set(factory, moved);
        }
        return rewrite(code, ast, toAsync);
      });
    },
  };
}

/** The factory of a `jest.mock`/`jest.doMock` call with an inline function factory. */
function mockFactoryOf(node: any): any {
  if (node.type !== "CallExpression" || node.arguments.length < 2) return null;
  const callee = node.callee;
  if (callee?.type !== "MemberExpression" || callee.computed) return null;
  if (callee.object?.type !== "Identifier" || callee.object.name !== "jest") return null;
  if (callee.property?.type !== "Identifier" || !WITH_FACTORY.has(callee.property.name)) {
    return null;
  }
  const factory = node.arguments[1];
  return factory.type === "ArrowFunctionExpression" || factory.type === "FunctionExpression"
    ? factory
    : null;
}

/**
 * The transform itself. `toAsync` maps a factory to the `jest.requireActual` calls that
 * load through Vite instead (see "`jest.requireActual` of project source" above).
 */
function rewrite(code: string, ast: any, toAsync: Map<any, any[]>) {
  const s = new MagicString(code);
  let changed = false;
  // Statements at the top level, where a registration can be hoisted beside them.
  const topLevel = new Map<any, any>();
  for (const statement of ast.body) {
    if (statement.type === "ExpressionStatement") topLevel.set(statement.expression, statement);
  }
  // Whether a factory now reaches the setup's globals (SETUP_ACCESSOR).
  let usesSetup = false;
  // Factories already replaced, whose source must not be edited again.
  const replaced: [number, number][] = [];

  /** The factory's source, async, with its own project `requireActual`s via Vite. */
  const asyncFactory = (factory: any, calls: any[]): string => {
    let text = "";
    let at = factory.start;
    for (const call of [...calls].sort((a, b) => a.start - b.start)) {
      const arg = call.arguments[0];
      text += code.slice(at, call.start);
      text += `(${SETUP}("__vnActualExports")(await vi.importActual(${code.slice(arg.start, arg.end)})))`;
      at = call.end;
    }
    text += code.slice(at, factory.end);
    return factory.async ? text : `async ${text}`;
  };

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
        usesSetup = true;
        const moved = toAsync.get(factory);
        if (spec !== null) {
          // Registered where Vitest hoists the call (see node-registry.mjs), with
          // the async variant after the original when there is one.
          const original = code.slice(factory.start, factory.end);
          const factories = moved ? `${original}, ${asyncFactory(factory, moved)}` : original;
          const register = `globalThis.__vnJestMock?.(import.meta.url, ${spec}, ${factories})`;
          const lookup = `() => ${SETUP}("__vnJestMocked")(import.meta.url, ${spec})`;
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
          // Wrap a function factory so its return is run through Jest CJS interop,
          // which awaits an async one. No Node-side load can reach this mock, so
          // the async variant replaces the original.
          if (moved) {
            s.overwrite(factory.start, factory.end, asyncFactory(factory, moved));
            replaced.push([factory.start, factory.end]);
          }
          s.appendLeft(factory.start, `() => ${SETUP}("__vnInteropMock")((`);
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
  if (usesSetup) s.prepend(SETUP_ACCESSOR);
  return { code: s.toString(), map: s.generateMap({ hires: true }) };
}

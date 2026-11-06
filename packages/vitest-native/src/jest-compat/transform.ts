import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MagicString } from "magic-string";
import { findNodeModuleMocks, type ManualMocks } from "./root-mocks.js";

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
// Only what Vite owns is rewritten (isViteOwnedSource): a specifier Vite resolves to a
// source file that the engine and Vitest leave to Vite. That covers relative and
// absolute paths and every alias Vite applies (string, regex, tsconfig paths) without
// restating Vite's alias rules here. A package keeps the Node load: presets shadow
// packages by name there (native/hooks.mjs). Calls
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

/** The slice of reactNative()'s ownership policy this transform asks (native/ownership.mjs). */
interface Ownership {
  decideFile(file: string): { owner: string };
}

/** What the transform knows of the project it runs in, read in configResolved. */
interface Project {
  /** reactNative()'s policy under the native engine, else null. */
  ownership: () => Ownership | null;
  /**
   * What already stands in for this package in reactNative(), as a phrase (a preset, or
   * the library's own Jest setup), or null. Null without reactNative().
   */
  coveredBy: (spec: string) => string | null;
  /** Vitest's `server.deps.inline` and `server.deps.external`. */
  inline: unknown[];
  external: unknown[];
}

const matchesRegExp = (patterns: unknown[], file: string) =>
  patterns.some((pattern) => {
    // `server.deps.inline: true` inlines everything, as Vitest reads it.
    if (pattern === true) return true;
    if (!(pattern instanceof RegExp)) return false;
    pattern.lastIndex = 0;
    const hit = pattern.test(file);
    pattern.lastIndex = 0;
    return hit;
  });

/**
 * Whether a resolveId result is a source file Vite evaluates itself, so the real
 * module `vi.importActual` loads is the one the app imports.
 *
 * The owner is the engine's ownership policy, as for every other load: a workspace
 * package the engine detected as React Native, or one named in `transform`, resolves
 * outside node_modules but is Node's, and loading its actual module through Vite would
 * make the second copy this rewrite exists to avoid. `resolved.external` cannot say so:
 * Vitest externalizes in its module runner, after resolveId, and never sets it (this
 * change's first version relied on it and refused such a partial mock as a cycle).
 * Where the policy defers to Vitest, or there is none (the mock engine), Vitest's own
 * rule applies: a file outside node_modules is inlined unless a `server.deps.external`
 * regex names it and no `server.deps.inline` regex (or `inline: true`) does. The engine also lists its
 * Node-owned patterns there (native/apply.ts), so the two agree.
 */
function isViteOwnedSource(
  resolved: { id: string; external?: unknown } | null,
  project: Project,
): boolean {
  if (!resolved || resolved.external) return false;
  const id = resolved.id.split("?")[0];
  if (id.startsWith("\0") || !path.isAbsolute(id) || !SOURCE_FILE.test(id)) return false;
  let file = id;
  try {
    file = fs.realpathSync.native(id);
  } catch {
    // not on disk (a virtual id that looks like a path): judged as resolved
  }
  const owner = project.ownership()?.decideFile(file).owner;
  if (owner === "vite") return true;
  if (owner === "node" || NODE_MODULES.test(file)) return false;
  const normalized = file.replace(/\\/g, "/");
  return matchesRegExp(project.inline, normalized) || !matchesRegExp(project.external, normalized);
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
export function jestMockTransform(options: JestMockTransformOptions = {}): Plugin {
  let project: Project = {
    ownership: () => null,
    coveredBy: () => null,
    inline: [],
    external: [],
  };
  // Jest's manual mocks of node_modules packages, per Vite root: test.projects can share
  // one instance of this plugin, and each project's mocks are its own.
  const rootMockModules = new Map<string, RootMockModule>();
  const projectsByRoot = new Map<string, Project>();
  return {
    name: "vitest-native:jest-mock-hoist",
    // Ahead of the project's setup files, a generated module mocks each package that
    // has a manual mock, as Jest applies one with no jest.mock() call. A setup file's or
    // test file's own jest.mock(name, factory) or jest.unmock(name) registers later and
    // wins, as Jest decides an explicit one first (jest-runtime `_explicitShouldMock`).
    config(userConfig) {
      if (options.rootMocks === false) return;
      const test = ((userConfig as { test?: Record<string, unknown> }).test ??= {});
      const root = path.resolve(
        (test.root as string | undefined) ?? userConfig.root ?? process.cwd(),
      );
      const ignore = (options.modulePathIgnorePatterns ?? []).map(
        (pattern) => new RegExp(pattern.replaceAll("<rootDir>", root)),
      );
      const found = findNodeModuleMocks(
        (options.roots ?? ["."]).map((r) => path.resolve(root, r)),
        root,
        ignore,
      );
      if (found.mocks.length === 0 && found.duplicates.length === 0) return;
      const id = path.join(root, ROOT_MOCKS_FILE);
      rootMockModules.set(id, { root, ...found });
      // Vite documents mutating the config here where merging cannot place a value: a
      // returned setupFiles array would be appended after the project's own.
      const setupFiles = Array.isArray(test.setupFiles)
        ? [...(test.setupFiles as string[])]
        : test.setupFiles
          ? [test.setupFiles as string]
          : [];
      if (setupFiles.includes(id)) return;
      let compat = -1;
      setupFiles.forEach((file, index) => {
        if (JEST_COMPAT_SETUP.test(file)) compat = index;
      });
      setupFiles.splice(compat + 1, 0, id);
      test.setupFiles = setupFiles;
    },
    configResolved(config) {
      const native = config.plugins.find((plugin) => plugin.name === "vitest-native") as
        | {
            api?: {
              nativeOwnership?: () => Ownership | null;
              packageCoveredBy?: (spec: string) => string | null;
            };
          }
        | undefined;
      const deps = (
        config as unknown as {
          test?: { server?: { deps?: { inline?: unknown; external?: unknown } } };
        }
      ).test?.server?.deps;
      const list = (value: unknown) =>
        Array.isArray(value) ? value : value == null ? [] : [value];
      project = {
        ownership: () => native?.api?.nativeOwnership?.() ?? null,
        coveredBy: (spec) => native?.api?.packageCoveredBy?.(spec) ?? null,
        inline: list(deps?.inline),
        external: list(deps?.external),
      };
      if (config.root) projectsByRoot.set(path.resolve(config.root), project);
    },
    resolveId(this: { environment?: { config?: { root?: string } } }, id: string) {
      if (rootMockModules.has(id)) return id;
      // Vitest hands a setup file under the root to its runner root-relative.
      if (id !== `/${ROOT_MOCKS_FILE}`) return null;
      const root = this.environment?.config?.root;
      const file = root ? path.join(path.resolve(root), ROOT_MOCKS_FILE) : null;
      return file && rootMockModules.has(file) ? file : null;
    },
    load(id: string) {
      const module = rootMockModules.get(id);
      if (!module) return null;
      // Read here, not in config(): reactNative() decides its presets in configResolved.
      const owner = projectsByRoot.get(module.root) ?? project;
      return rootMocksSource(module, (spec) => owner.coveredBy(spec));
    },
    // No `enforce` (normal order): this must run AFTER Vite's esbuild strips
    // TS/JSX (so `this.parse`, which is acorn, gets plain JS) but BEFORE Vitest's
    // enforce:post `vitest:mocks` hoister. enforce:'pre' would see raw TSX and fail
    // to parse; enforce:'post' could run after the hoister.
    transform(code: string, id: string) {
      if (id.includes("/node_modules/")) return null;
      const file = id.split("?")[0];
      if (!TRANSFORMABLE.test(file)) return null;
      if (!HAS_JEST_MOCK.test(code)) return null;
      const owner = rootMockModules.has(file)
        ? (projectsByRoot.get(rootMockModules.get(file)!.root) ?? project)
        : project;
      // The manual mocks of the project this file belongs to (the longest root containing
      // it), for a factory-less jest.mock(name) in it: Jest gives that call the manual mock.
      let module: RootMockModule | undefined;
      for (const candidate of rootMockModules.values()) {
        if (
          (file === candidate.root ||
            file.startsWith(candidate.root + path.sep) ||
            file.startsWith(candidate.root + "/")) &&
          (!module || candidate.root.length > module.root.length)
        ) {
          module = candidate;
        }
      }
      const moduleOwner = module ? (projectsByRoot.get(module.root) ?? project) : project;
      const manualMockFor = (spec: string): string | null => {
        const mock = module?.mocks.find((m) => m.spec === spec);
        return mock && !moduleOwner.coveredBy(spec) ? mock.file : null;
      };
      const finish = (adapted: Adapted | null) => {
        if (!adapted?.changed) return null;
        if (adapted.usesSetup) adapted.s.prepend(SETUP_ACCESSOR);
        return { code: adapted.s.toString(), map: adapted.s.generateMap({ hires: true }) };
      };
      // Synchronous unless a factory's jest.requireActual has to be resolved.
      const adapted = adapt(this, code, id, owner, manualMockFor);
      return adapted instanceof Promise ? adapted.then(finish) : finish(adapted);
    },
  } as Plugin;
}

/** Options for {@link jestMockTransform}. */
export interface JestMockTransformOptions {
  /**
   * Jest's `roots`, relative to the Vite root: where Jest looks for `__mocks__` folders,
   * at any depth. A file in one mocks the node_modules package of the same name in
   * every test, with no `jest.mock()` call, as under Jest. Default: the Vite root.
   */
  roots?: string[];
  /** Jest's `modulePathIgnorePatterns`: `__mocks__` files they match do not count. */
  modulePathIgnorePatterns?: string[];
  /**
   * `false` applies no manual mocks of node_modules packages automatically, unlike
   * Jest; each then needs a `jest.mock('<package>')`. Default: `true`.
   */
  rootMocks?: boolean;
}

/** The generated setup module's file name, in each project's root. */
const ROOT_MOCKS_FILE = "vitest-native.root-mocks.mjs";
/** `jestCompatSetup`, as a specifier or a path to the built file. */
const JEST_COMPAT_SETUP = /(?:^vitest-native\/jest-compat\/setup|[\\/]jest-compat[\\/]setup\.mjs)$/;

interface RootMockModule extends ManualMocks {
  root: string;
}

/** Each warning once per process, though every project and run loads the module. */
const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/**
 * The generated setup module: one `jest.mock()` per manual mock, with a factory loading
 * its file, which the transform then adapts like any other. A package reactNative()
 * already stands in for is left to it, with a warning.
 */
export function rootMocksSource(
  module: RootMockModule,
  coveredBy: (spec: string) => string | null,
): string {
  const shown = (file: string) => path.relative(module.root, file).split(path.sep).join("/");
  for (const duplicate of module.duplicates) {
    warnOnce(
      [
        `[vitest-native] duplicate manual mock found: ${duplicate.name}`,
        "  The following files share their name; please delete one of them:",
        ...duplicate.files.map((file) => `    * ${shown(file)}`),
        `  jestMockTransform() applies the last one listed, as Jest applies the one it reads last.`,
      ].join("\n"),
    );
  }
  const calls: string[] = [];
  for (const mock of module.mocks) {
    const covered = coveredBy(mock.spec);
    if (covered) {
      warnOnce(
        `[vitest-native] ${shown(mock.file)} is not applied to ${mock.spec}: ${covered} stands ` +
          `in for it. Delete the manual mock (\`vitest-native migrate\` lists these), or switch ` +
          `that off to use the mock.`,
      );
      continue;
    }
    // A factory loading the file, for every manual mock: the transform registers a factory
    // with Node's registry too, so a require() of the package gets the mock, as an import
    // does. (A factory-less jest.mock reached only Vite's graph, and Vitest's own lookup
    // finds a file only in the root's top-level __mocks__.)
    calls.push(`jest.mock(${JSON.stringify(mock.spec)}, ${manualMockFactory(mock.file)});`);
  }
  // The jest-compat setup first, wherever the project loads it (test.setupFiles, or an
  // import in its own setup file): an ES module runs once, so this only orders it ahead of
  // the registrations, which need its Node-side registry. Inside vi.hoisted, because Vitest
  // hoists the registrations above a module's static imports; hoisted calls keep their
  // order, so this one runs first.
  return (
    `import { vi } from "vitest";\n` +
    `await vi.hoisted(async () => {\n  await import(${JSON.stringify(jestCompatSetupFile())});\n});\n` +
    `${calls.join("\n")}\nexport {};\n`
  );
}

/**
 * The jest-compat setup file this plugin ships, by path: the file `jestCompatSetup`
 * resolves to from the project, so importing it is the same module, evaluated once.
 * Resolved here, inside the package, because the generated module's own directory may not
 * resolve the package by name (a project outside its install, as this repository's
 * fixtures are).
 */
let setupFile: string | undefined;
function jestCompatSetupFile(): string {
  setupFile ??= fileURLToPath(import.meta.resolve("vitest-native/jest-compat/setup"));
  return setupFile;
}

/**
 * The factory that loads a manual mock's file. Named, so jest-compat's registry knows it
 * for a manual mock (MANUAL_MOCK_FACTORY in node-registry.mjs): while it runs, the module
 * it mocks is the real one, as under Jest.
 */
function manualMockFactory(file: string): string {
  return `function __vnManualMock() { return jest.requireActual(${JSON.stringify(file)}); }`;
}

/** A file's jest.* calls, adapted (see rewrite). */
interface Adapted {
  s: MagicString;
  changed: boolean;
  usesSetup: boolean;
}

function adapt(
  ctx: { parse(code: string): any; resolve(spec: string, importer: string): Promise<any> },
  code: string,
  id: string,
  project: Project,
  manualMockFor: (spec: string) => string | null = () => null,
): Adapted | null | Promise<Adapted | null> {
  let ast: any;
  try {
    ast = ctx.parse(code);
  } catch {
    return null; // let the normal pipeline surface the syntax error
  }

  // The factories' own `jest.requireActual` calls, which may move to Vite.
  const candidates = new Map<any, { node: any; spec: string }[]>();
  walk(ast, (node) => {
    const factory = mockFactoryOf(node);
    if (!factory || factory.generator) return;
    const calls = ownRequireActualCalls(factory);
    if (calls.length > 0) candidates.set(factory, calls);
  });
  if (candidates.size === 0) return rewrite(code, ast, new Map(), manualMockFor);

  const specs = new Set([...candidates.values()].flat().map((call) => call.spec));
  return Promise.all(
    [...specs].map(async (spec) => {
      try {
        return [spec, isViteOwnedSource(await ctx.resolve(spec, id), project)] as const;
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
    return rewrite(code, ast, toAsync, manualMockFor);
  });
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
function rewrite(
  code: string,
  ast: any,
  toAsync: Map<any, any[]>,
  manualMockFor: (spec: string) => string | null = () => null,
): Adapted {
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

    // A factory-less jest.mock(name) of a package with a manual mock under the project's
    // roots: Jest gives it that manual mock. Vitest would look only in the root's
    // top-level __mocks__ and otherwise automock, replacing the setup's registration of
    // the manual mock (rootMocksSource), so it is registered as that factory instead:
    // synchronous for Node's require, and through Vite for the file's imports.
    const literal =
      specNode && specNode.type === "Literal" && typeof specNode.value === "string"
        ? specNode.value
        : null;
    const manualMock =
      prop.name === "mock" && node.arguments.length === 1 && literal !== null
        ? manualMockFor(literal)
        : null;
    const mockStatement = topLevel.get(node);
    if (manualMock !== null && mockStatement) {
      usesSetup = true;
      const file = JSON.stringify(manualMock);
      const original = manualMockFactory(manualMock);
      const viaVite = `async () => (${SETUP}("__vnActualExports")(await vi.importActual(${file})))`;
      const register = `globalThis.__vnJestMock?.(import.meta.url, ${spec}, ${original}, ${viaVite})`;
      s.prependLeft(mockStatement.start, `vi.hoisted(() => ${register});\n`);
      s.appendLeft(specNode.end, `, () => ${SETUP}("__vnJestMocked")(import.meta.url, ${spec})`);
      return;
    }

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

  return { s, changed, usesSetup };
}

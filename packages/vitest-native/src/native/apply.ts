/**
 * Vite/Vitest config fragment for the native engine.
 *
 * # Module ownership
 *
 * The native engine runs two module systems at once, and every rule in this file
 * exists to serve one invariant:
 *
 *   **Exactly one of them owns any given package, for the duration of a run.**
 *
 * Two graphs is fine. Two *copies* is the bug, and it is silent: nothing throws,
 * module-level state simply stops being shared, so a store written through one copy
 * reads back unset through the other and a translated label renders as "". Note the
 * invariant is one OWNER, not one path — two graphs resolving to the same file still
 * produce two instances (see the duplicate-instance warning in hooks.mjs).
 *
 * Who owns what, and why:
 *
 * - **Node owns React Native and `@react-native/*`.** Not a preference: the Flow
 *   strip, the Babel transform, the boundary mocks and the precompiled registry are
 *   all implemented as Node loader hooks. This is the engine.
 * - **Node owns installed React Native packages** — those declaring `react-native` in
 *   their own manifest — and their dependency closures. They ship source Node cannot
 *   run unaided (untranspiled JSX, Flow, TypeScript), they are reachable from React
 *   Native's own require graph, and the same hooks compile them.
 * - **Vite owns all first-party source**: the application, and the whole of the
 *   package under test. Its `react-native` imports cross into Node's single React
 *   Native instance exactly as application code's always have.
 * - **Vite owns every test entry**, unconditionally. A test file is something Vitest
 *   runs, never something a module imports. Handing one to Node compiles it to
 *   CommonJS, and its own `import { it } from 'vitest'` becomes `require('vitest')`,
 *   which throws.
 * - **Never claimed by either rule above**: the test library, the renderers, and
 *   React itself (see NEVER_INLINE in ecosystem.ts). The engine wires these up; a
 *   second copy of any of them corrupts rendering.
 *
 * The consequence worth knowing: a workspace library is Vite-owned when it is the
 * package under test and Node-owned when the run merely depends on it. Ownership
 * follows what is under test. The invariant still holds — one owner per run — but the
 * same library is not hosted identically by both kinds of run.
 */
/** Escape a package name for use inside a RegExp character-delimited path match. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { createRequire } from "node:module";
import path from "node:path";
import type { PoolRunnerInitializer } from "vitest/node";
import { containsPath } from "./paths.js";

/**
 * The on-disk directory a package resolves to, or null. Used alongside the
 * node_modules-anchored patterns so workspace and `file:` dependencies — which
 * resolve to a real path with no node_modules segment — are matched too.
 */
function resolvePackageDir(name: string, projectRoot: string): string | null {
  try {
    const req = createRequire(path.join(projectRoot, "package.json"));
    return path.dirname(req.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

/**
 * The patterns that externalize a package: under `node_modules/<name>/`, and inside
 * the directory it resolves to — the second being what covers workspace and `file:`
 * links, which have no `node_modules` segment at all.
 *
 * The resolved-directory anchor is dropped when that directory CONTAINS the project
 * root, because then it is the project. Externalizing it hands Vitest its own source
 * and test files back through Node, which compiles them to CommonJS: a test file's
 * `import { it } from 'vitest'` becomes `require('vitest')` and throws, and any
 * first-party module using `import.meta` dies with a SyntaxError.
 *
 * Auto-detection already refuses to claim the project (see ecosystem.ts), but
 * `transform: [...]` names packages by hand and reaches this code without passing
 * through detection — so a project naming its own package there, which a migrated
 * Jest `transformIgnorePatterns` list can easily produce, hit exactly the same wall.
 */
function externalPatternsFor(name: string, projectRoot: string): RegExp[] {
  const patterns = [new RegExp(`[\\\\/]node_modules[\\\\/]${escapeRe(name)}[\\\\/]`)];
  const dir = resolvePackageDir(name, projectRoot);
  if (dir && !containsPath(dir, projectRoot)) {
    patterns.push(new RegExp(`^${escapeRe(dir.replace(/\\/g, "/"))}[\\\\/]`));
  }
  return patterns;
}

/**
 * Files outside any installed package that Vitest may be running as an ENTRY rather
 * than importing as a module: the two naming conventions test runners use.
 *
 * Neither is exhaustive — a project can point `test.include` anywhere — but a file
 * that matches one of these is a test by convention and never library source, which
 * is what makes it safe to keep out of Node's graph unconditionally.
 */
const OUTSIDE_NODE_MODULES = String.raw`^(?!.*[\\/]node_modules[\\/])`;
const TEST_ENTRY_PATTERNS = [
  new RegExp(String.raw`${OUTSIDE_NODE_MODULES}.*\.(?:test|spec)\.[cm]?[jt]sx?$`),
  new RegExp(String.raw`${OUTSIDE_NODE_MODULES}.*[\\/]__tests__[\\/].*\.[cm]?[jt]sx?$`),
];

export type JsxTransformConfig =
  | { esbuild: { jsx: "automatic" } }
  | { oxc: { jsx: { runtime: "automatic" } } };

export function nativeEngineConfig(
  setupFilePath: string,
  env: Record<string, string>,
  extensions: string[],
  transformPkgs: string[] = [],
  hot?: { pool: PoolRunnerInitializer; runnerPath: string },
  jsxTransform: JsxTransformConfig = { esbuild: { jsx: "automatic" } },
  userPool?: unknown,
  inlinePkgs: string[] = [],
  projectRoot: string = process.cwd(),
  userInlinesEverything = false,
) {
  // Extra packages whose source the Node hooks should transform. They must also
  // be externalized so they load through Node (where the hooks run) rather than
  // Vite's pipeline. Passed to the hooks via env (globalThis doesn't cross the
  // worker boundary).
  // Anchored on node_modules, plus each package's resolved directory. A bare
  // `[/\]name[/\]` also matches any DIRECTORY sharing a package's name, which
  // externalized unrelated files — including this package's own runtime when a
  // project folder happened to share the name. The resolved directory covers
  // workspace and `file:` links, which have no node_modules segment at all.
  const extraExternal = transformPkgs.flatMap((p) => externalPatternsFor(p, projectRoot));
  // Auto-detected React Native packages are externalized too, and transformed by the
  // Node hooks alongside everything else.
  //
  // They used to be INLINED so Vite executed them. That put two module systems in
  // play for one package: Vite's copy, and a second one for anything reaching it
  // through Node — which is how a store configured in one place read back unset in
  // another, silently. Node also had no way to load them at all, since the hooks
  // transform only React Native and the packages named in `transform`, so a require
  // of an ecosystem package failed outright on its untranspiled source.
  //
  // Ownership by one graph makes a single instance structural rather than a
  // consequence of Vitest's externalization heuristics. Both properties inlining was
  // there to provide are kept, and were measured rather than assumed: vi.mock still
  // intercepts, and module state still resets between test files.
  const ecosystemExternal = inlinePkgs.flatMap((p) => externalPatternsFor(p, projectRoot));
  // The Node hooks transform whatever they are told to; ecosystem packages now load
  // through them, so they belong in that list rather than in Vite's.
  const nodeTransformed = [...new Set([...transformPkgs, ...inlinePkgs])];
  const fullEnv = { ...env };
  if (nodeTransformed.length > 0) {
    fullEnv.VITEST_NATIVE_TRANSFORM = JSON.stringify(nodeTransformed);
  }
  return {
    // Match React Native's Babel preset: the automatic JSX runtime, so app/test
    // files that use JSX without importing React (RN's default style) compile to
    // `react/jsx-runtime` calls instead of `React.createElement` (which would throw
    // "React is not defined"). RN's own source is transformed by our Babel hooks;
    // this governs the consumer's app + test files.
    ...jsxTransform,
    // `resolve.conditions` and `resolve.mainFields` govern the CLIENT environment.
    // Vitest runs tests in the ssr environment, which keeps its own — so setting only
    // the former left both unapplied, and a package shipping a distinct React Native
    // build through either mechanism silently loaded its web build instead.
    // Metro resolves `react-native` ahead of the standard fields, and plenty of
    // packages published before `exports` still ship their native build that way.
    // Vite drops `mainFields` for the ssr environment exactly as it drops
    // `conditions` (see getDefaultEnvironmentOptions), so this has to be set where
    // the tests resolve. Vite's own server defaults are kept underneath;
    // `browser` is deliberately NOT added — Metro lists it, but under Node it would
    // pull the web build of any package that has a browser field and no
    // react-native one.
    ssr: {
      resolve: {
        conditions: ["react-native"],
        mainFields: ["react-native", "module", "jsnext:main", "jsnext"],
      },
    },
    resolve: {
      conditions: ["react-native"],
      mainFields: ["react-native", "module", "jsnext:main", "jsnext"],
      extensions,
      // Ensure a single React instance across the test, RN, and the renderer —
      // a fresh consumer project can otherwise resolve duplicates and hit a null
      // hooks dispatcher ("Cannot read properties of null (reading 'use...')").
      dedupe: ["react", "react-test-renderer", "test-renderer", "react-is"],
    },
    test: {
      setupFiles: [setupFilePath],
      env: fullEnv,
      // Without the hot runtime we intentionally do NOT force `isolate`, so
      // Vitest's safe default (`isolate: true`) applies: each test file gets a
      // fresh module runner — but also a fresh worker, so RN reloads per file.
      //
      // Plain `isolate: false` shares one worker so RN loads once — but it
      // LEAKS state across files sharing a worker (proven by bench/leak: both
      // user-module singletons and RN's own stateful APIs like
      // DeviceEventEmitter carry over). So it stays an informed opt-in.
      //
      // The hot runtime (`hotRuntime: true`) reclaims the speed safely:
      // isolate:false here is only the SCHEDULING decision (keep workers
      // alive); the custom pool's worker entry flips isolate back on inside
      // the worker, so Vitest's own per-file module-runner reset still runs.
      // The custom runner marks each file's import-phase boundary for the
      // surgical reset (see runner.mjs + reset.mjs).
      //
      // `threads` is only a DEFAULT. A plugin's config() result is merged over the
      // user's config, so returning it unconditionally silently overrode an
      // explicit `pool` — a project asking for `forks`, `vmThreads`, or its own
      // pool got `threads` with no warning. Only fill it in when the user left it
      // unset. (The hot runtime is different: it *is* a pool, so opting into
      // `hotRuntime` selects it, and the plugin warns when that overrides a
      // user-chosen pool.)
      ...(hot
        ? { pool: hot.pool, isolate: false, runner: hot.runnerPath }
        : { pool: (userPool ?? "threads") as "threads" }),
      server: {
        deps: {
          // A test file is an entry Vitest owns, never a dependency — but the
          // externalization patterns below are directories, and a detected workspace
          // library can be the very package whose tests are running (an Nx-style run
          // from the repository root collects them from inside it). Externalizing an
          // entry hands Vitest's own graph to Node, where the loader compiles it to
          // CommonJS and `import { it } from 'vitest'` becomes `require('vitest')` —
          // which throws outright. `inline` is checked before `external`, so this
          // keeps entries in Vite's graph whatever the directory patterns say.
          // Restricted to first-party paths: a test file shipped inside an installed
          // package is not an entry, and nothing imports it.
          //
          // Omitted when the project set `deps.inline: true`, which already inlines
          // everything. Appending patterns to that produces an array holding `true`,
          // which Vitest then calls `.test()` on — "ex.test is not a function", and
          // no tests run at all.
          ...(userInlinesEverything ? {} : { inline: TEST_ENTRY_PATTERNS }),
          external: [
            /[\\/]node_modules[\\/]react-native[\\/]/,
            /[\\/]node_modules[\\/]@react-native[\\/]/,
            ...extraExternal,
            ...ecosystemExternal,
          ],
        },
      },
    },
  };
}

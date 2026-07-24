/**
 * Vite/Vitest config fragment for the native engine. RN is externalized so it
 * loads through Node's single CJS graph, where the native setup file's hooks
 * Flow-strip it and mock the native boundary.
 */
/** Escape a package name for use inside a RegExp character-delimited path match. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { createRequire } from "node:module";
import path from "node:path";
import type { PoolRunnerInitializer } from "vitest/node";

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
  const extraExternal = transformPkgs.flatMap((p) => {
    const patterns = [new RegExp(`[\\\\/]node_modules[\\\\/]${escapeRe(p)}[\\\\/]`)];
    const dir = resolvePackageDir(p, projectRoot);
    if (dir) patterns.push(new RegExp(`^${escapeRe(dir.replace(/\\/g, "/"))}[\\\\/]`));
    return patterns;
  });
  // Auto-detected React Native packages go the other way: INLINED, so Vitest owns
  // them. That is what lets vi.mock() intercept them and what puts their module
  // state under Vitest's per-file reset. The plugin's transform hook compiles their
  // untranspiled source (see plugin.ts); Vite would otherwise refuse to parse the
  // JSX and Flow the ecosystem ships.
  const ecosystemInline = inlinePkgs.flatMap((p) => {
    const patterns = [new RegExp(`[\\\\/]node_modules[\\\\/]${escapeRe(p)}[\\\\/]`)];
    const dir = resolvePackageDir(p, projectRoot);
    if (dir) patterns.push(new RegExp(`^${escapeRe(dir.replace(/\\/g, "/"))}[\\\\/]`));
    return patterns;
  });
  const fullEnv = { ...env };
  if (transformPkgs.length > 0) fullEnv.VITEST_NATIVE_TRANSFORM = JSON.stringify(transformPkgs);
  return {
    // Match React Native's Babel preset: the automatic JSX runtime, so app/test
    // files that use JSX without importing React (RN's default style) compile to
    // `react/jsx-runtime` calls instead of `React.createElement` (which would throw
    // "React is not defined"). RN's own source is transformed by our Babel hooks;
    // this governs the consumer's app + test files.
    ...jsxTransform,
    resolve: {
      conditions: ["react-native"],
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
          external: [
            /[\\/]node_modules[\\/]react-native[\\/]/,
            /[\\/]node_modules[\\/]@react-native[\\/]/,
            ...extraExternal,
          ],
          ...(ecosystemInline.length > 0 ? { inline: ecosystemInline } : {}),
        },
      },
    },
  };
}

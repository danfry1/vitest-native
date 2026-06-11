/**
 * Vite/Vitest config fragment for the native engine. RN is externalized so it
 * loads through Node's single CJS graph, where the native setup file's hooks
 * Flow-strip it and mock the native boundary.
 */
/** Escape a package name for use inside a RegExp character-delimited path match. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import type { PoolRunnerInitializer } from "vitest/node";

export function nativeEngineConfig(
  setupFilePath: string,
  env: Record<string, string>,
  transformPkgs: string[] = [],
  hot?: { pool: PoolRunnerInitializer; runnerPath: string },
) {
  // Extra packages whose source the Node hooks should transform. They must also
  // be externalized so they load through Node (where the hooks run) rather than
  // Vite's pipeline. Passed to the hooks via env (globalThis doesn't cross the
  // worker boundary).
  const extraExternal = transformPkgs.map((p) => new RegExp(`[\\\\/]${escapeRe(p)}[\\\\/]`));
  const fullEnv = { ...env };
  if (transformPkgs.length > 0) fullEnv.VITEST_NATIVE_TRANSFORM = JSON.stringify(transformPkgs);
  return {
    // Match React Native's Babel preset: the automatic JSX runtime, so app/test
    // files that use JSX without importing React (RN's default style) compile to
    // `react/jsx-runtime` calls instead of `React.createElement` (which would throw
    // "React is not defined"). RN's own source is transformed by our Babel hooks,
    // not esbuild; this governs the consumer's app + test files.
    esbuild: { jsx: "automatic" as const },
    resolve: {
      conditions: ["react-native"],
      extensions: [
        ".ios.tsx",
        ".ios.ts",
        ".ios.js",
        ".native.tsx",
        ".native.ts",
        ".native.js",
        ".tsx",
        ".ts",
        ".jsx",
        ".js",
      ],
      // Ensure a single React instance across the test, RN, and the renderer —
      // a fresh consumer project can otherwise resolve duplicates and hit a null
      // hooks dispatcher ("Cannot read properties of null (reading 'use...')").
      dedupe: ["react", "react-test-renderer", "react-is"],
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
      ...(hot
        ? { pool: hot.pool, isolate: false, runner: hot.runnerPath }
        : { pool: "threads" as const }),
      server: {
        deps: {
          external: [/[\\/]react-native[\\/]/, /[\\/]@react-native[\\/]/, ...extraExternal],
        },
      },
    },
  };
}

/**
 * Vite/Vitest config fragment for the native engine. RN is externalized so it
 * loads through Node's single CJS graph, where the native setup file's hooks
 * Flow-strip it and mock the native boundary.
 */
export function nativeEngineConfig(setupFilePath: string, env: Record<string, string>) {
  return {
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
      env,
      // Reuse the worker runtime across files: RN's module graph loads once
      // (via Node's cache) instead of per file, so wall-time stays ~flat as the
      // suite grows (jest re-requires per file). Measured: full per-file state
      // isolation still holds (module state AND globalThis), so this is safe —
      // users can override with `test.isolate: true` if a suite needs it.
      isolate: false,
      pool: "threads",
      server: {
        deps: {
          external: [/[\\/]react-native[\\/]/, /[\\/]@react-native[\\/]/],
        },
      },
    },
  };
}

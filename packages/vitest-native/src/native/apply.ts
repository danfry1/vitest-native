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
      // We intentionally do NOT force `isolate`, so Vitest's safe default
      // (`isolate: true`) applies: each test file gets a fresh module runner.
      //
      // `isolate: false` shares one worker so RN's module graph loads once and
      // wall-time stays flat as the suite grows — but it LEAKS state across
      // files that share a worker (proven by bench/leak: both user-module
      // singletons and RN's own stateful APIs like DeviceEventEmitter carry over
      // between files). That manifests as order-dependent, flaky failures. So
      // `isolate: false` is an informed opt-in a consumer can set in their own
      // config, not the default. (A future "hot runtime + surgical per-file
      // reset" build will reclaim the speed safely.)
      pool: "threads",
      server: {
        deps: {
          external: [/[\\/]react-native[\\/]/, /[\\/]@react-native[\\/]/],
        },
      },
    },
  };
}

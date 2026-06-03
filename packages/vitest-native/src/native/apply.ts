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
    },
    test: {
      setupFiles: [setupFilePath],
      env,
      server: {
        deps: {
          external: [/[\\/]react-native[\\/]/, /[\\/]@react-native[\\/]/],
        },
      },
    },
  };
}

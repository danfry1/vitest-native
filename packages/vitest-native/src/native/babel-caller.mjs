// The caller Babel sees for project source, wherever the engine compiles it: Node's
// require (transform.mjs, CommonJS out) and Vite's load (project-babel.ts, ES modules
// out). A config's `api.caller` branches take the same name and platform on both sides,
// as babel-jest's and Metro's do; only the module-format flags differ, because each side
// needs its own output.

/**
 * babel-jest's caller (babel-jest 29.7, build/index.js:196-237), or jest-expo's Metro
 * caller with the platform when the project has Expo (jest-expo 57,
 * config/getPlatformPreset.js:48-66), which babel-preset-expo reads to inline
 * Platform.OS and process.env.EXPO_OS.
 * `esm`: ES modules out (Vite), else CommonJS (Node, Jest's defaults without
 * --experimental-vm-modules, jest-runtime 29.7 build/index.js:173-179).
 */
export function projectBabelCaller({ hasExpo, platform, esm }) {
  const flags = {
    supportsDynamicImport: esm,
    supportsExportNamespaceFrom: esm,
    supportsStaticESM: esm,
    supportsTopLevelAwait: esm,
  };
  if (hasExpo) return { name: "metro", bundler: "metro", platform, ...flags };
  return { name: "babel-jest", ...flags };
}

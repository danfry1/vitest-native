// Runs as a user setup file, after vitest-native's own (setup.ts, then
// preset-ready.mjs). A preset's async preparation must be complete by then: a setup
// file, or a CommonJS library a test imports, may require() the package at its top
// level. Records whether the skia preset's module existed at this point, for
// tests/skia-preset.test.tsx; it does not depend on how long CanvasKit takes.
(globalThis as any).__vnSkiaMockAtUserSetup =
  (globalThis as any).__vitest_native_preset_mocks?.["@shopify/react-native-skia"] !== undefined;

// The mock engine's second setup file, listed directly after setup.ts. setup.ts
// starts each preset's async preparation (the skia preset loads CanvasKit), but it
// cannot await it: it is bundled, and the bundler also emits it as CommonJS, where a
// top-level await does not compile. This file waits instead, so a preset's module is
// built before any user setup file or test file loads, including a CommonJS library
// that require()s the package at its top level. A preparation that failed throws
// here, failing the file with the preset's own error. Plain .mjs, shipped verbatim,
// with no imports, so it is the same file in src/ and dist/.
await globalThis.__vitest_native_presets_ready;

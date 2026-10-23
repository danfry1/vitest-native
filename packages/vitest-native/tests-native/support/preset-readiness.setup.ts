// Runs as a user setup file, after vitest-native's own. A preset's async preparation
// must be complete by then: a setup file, or a module a test imports, may use the
// package at its top level. Records whether it was, for tests-native/skia.test.tsx.
//
// It asks the readiness promise whether it has settled, as the first setup file after
// vitest-native's own. CanvasKit takes about 20 ms to load, so a setup that did not
// wait for it usually fails this, but not always: a cold transform of this file can
// take as long. tests-native/custom-preset checks the same order with a preparation
// slow enough not to depend on timing. A settled
// promise runs its callback before the continuation of an `await` that follows; a
// pending one does not.
let settled = false;
void (globalThis as any).__vitest_native_presets_ready?.then(() => {
  settled = true;
});
await Promise.resolve();
(globalThis as any).__vnPresetsSettledAtUserSetup = settled;
(globalThis as any).__vnCanvasKitAtUserSetup = (globalThis as any).CanvasKit !== undefined;

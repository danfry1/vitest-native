// Runs as a user setup file, after vitest-native's own. A preset's async preparation
// must be complete by then: a setup file, or a module a test imports, may use the
// package at its top level. Records what the skia preset left behind for
// tests-native/skia.test.tsx to assert; a timing race cannot pass this.
(globalThis as any).__vnCanvasKitAtUserSetup = (globalThis as any).CanvasKit !== undefined;

// Runs as a user setup file, after vitest-native's own. A preset's async preparation
// must be complete by then: a setup file, or a module a test imports, may use the
// package at its top level. Records what the skia preset left behind for
// tests-native/skia.test.tsx to assert. It observes the order, not how long CanvasKit
// takes: Vitest runs setup files one after another, each awaited.
(globalThis as any).__vnCanvasKitAtUserSetup = (globalThis as any).CanvasKit !== undefined;

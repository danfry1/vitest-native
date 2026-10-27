---
"vitest-native": patch
---

A recoverable React error no longer fails the run under either engine. With React 19's `react-test-renderer` (RNTL 12 and 13), a component that throws once during a concurrent render, which React then renders again successfully, was reported as an uncaught exception on Node, so Vitest exited with an unhandled error while every test passed. The engines now define `globalThis.reportError` when the environment has none: React's recoverable errors are logged with `console.error`, as React 18, RNTL 14 and React Native on a device log them, and every other report still fails the run as before.

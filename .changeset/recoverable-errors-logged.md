---
"vitest-native": patch
---

A recoverable React error no longer fails the run under either engine. With React 19's `react-test-renderer` (RNTL 12 and 13), a component that throws once during a concurrent render, which React then renders again successfully, was reported as an uncaught exception on Node, so Vitest exited with an unhandled error while every test passed. The renderer picks its error reporter once, when it loads, from `globalThis.reportError`; the engines now define one only while the renderer loads, and remove it after. React's recoverable errors are logged with `console.error`, as React 18.3's test renderer and RNTL 14's renderer log them (React Native on a device logs them as a warning), and every other report still fails the run as before. Other code still finds no `reportError`, so a library that feature-detects it behaves as it did.

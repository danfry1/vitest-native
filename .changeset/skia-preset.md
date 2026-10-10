---
"vitest-native": minor
---

A `skia` preset for `@shopify/react-native-skia`, which threw at import in tests ("Native Skia Module failed to correctly install JSI Bindings"). It is auto-detected when the package is installed, and works under both engines.

- It loads CanvasKit, Skia compiled to WebAssembly, and serves Skia's own test mock over it, so the `Skia` API computes with real Skia, and `Canvas` and its drawing render as Views.
- It adds Skia's Reanimated helpers (`usePathValue`, `useTexture`, …), which the mock leaves out, and makes `matchFont` return a font.

Presets can now declare an async `prepare()`, which runs before a preset's module is built.

---
"vitest-native": minor
---

A `skia` preset for Skia, which threw at import in tests ("Native Skia Module failed to correctly install JSI Bindings"). It covers both of Skia's package names, `react-native-skia` (2.15.0 and 3.x) and `@shopify/react-native-skia` (up to 2.14.0), shadows whichever is installed, and works under both engines.

- It loads CanvasKit, Skia compiled to WebAssembly, and serves Skia's own test mock over it, so the `Skia` API computes with real Skia, and `Canvas` and its drawing render as Views.
- Its named exports are read from the installed version's ESM build, since Skia's API changes between releases.
- It adds Skia's Reanimated helpers (`usePathValue`, `useTexture`, …), which the mock leaves out, and makes `matchFont` return a font.

The `Preset` type gains an optional async `prepare()`, which completes before any of the user's setup files or test files load, and `PresetModule` an optional `exportsFor()`, which reads the module's named exports from the installed package (or returns `null` when it is not installed, leaving it unshadowed). The skia preset uses both.

The project root given to test workers now follows `test.root` (or `--root`), as Vitest's does; a run started from a parent directory resolved packages from that directory in every worker.

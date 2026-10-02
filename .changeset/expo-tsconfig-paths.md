---
"vitest-native": patch
---

Resolve tsconfig path aliases in Expo projects, as Expo's Metro does

Expo CLI resolves the `paths` in `tsconfig.json` by default, and the SDK 57 template imports its
own components through `@/…`, so the first component test in a new Expo project failed with
"Cannot find package '@/components/…'". In an Expo project with a `tsconfig.json`, the plugin now
turns on Vite 8's `resolve.tsconfigPaths`. An explicit `resolve.tsconfigPaths` and
`experiments.tsconfigPaths: false` in `app.json` both take precedence. On Vite 6 and 7, which
cannot resolve tsconfig paths, it warns once with the remedy. Bare React Native projects are
unchanged, matching their Metro.

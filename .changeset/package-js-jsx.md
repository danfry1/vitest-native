---
"vitest-native": patch
---

**A package's `.js` file with JSX no longer stops the run with Vite's "Failed to parse source for import analysis" error under the native engine.** A package that declares no `react-native` dependency or peer isn't detected, so Vite serves it uncompiled, and Vite skips JSX in `.js` files. vitest-native now compiles JSX in such a file when Vite's parser rejects it; every file that parses is served unchanged. No action needed. A package that also ships Metro-only source, such as `react-native-calendars`, still needs `reactNative({ transform: ['<package>'] })`, and the error now says so.

---
"vitest-native": minor
---

Add a `transform` option for the native engine. By default the native engine
only transforms (Flow/TS/JSX strips) `react-native` / `@react-native`; third-party
React Native libraries that ship untranspiled source (e.g. `react-native-reanimated`,
`react-native-safe-area-context`) previously failed to load under `engine: 'native'`
with a syntax error. List them in `transform` and the engine's loader/require hooks
will transform them too (analogous to Jest's `transformIgnorePatterns` allowlist):

```ts
reactNative({ engine: 'native', transform: ['react-native-reanimated'] })
```

This is the first step toward running real-world suites (and migrating from Jest)
under the native engine.

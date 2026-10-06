---
"vitest-native": patch
---

Stop a circular-dependency warning on an Expo project's first run

Babel loads its presets and plugins with `require` during a transform, and those requires went
through the native engine's CommonJS hook like any other. `babel-plugin-syntax-hermes-parser` and
`hermes-parser`, which `@react-native/babel-preset` uses, keep an `@flow` header in their published
builds and sit under an `@react-native` package, so the hook sent them back through Babel
mid-transform. Babel then read a half-loaded plugin's exports and Node printed "Accessing
non-existent property 'then' of module exports inside circular dependency" on a cold cache, for
example on a fresh `create-expo-app` project. Code Babel loads during a transform now runs as
published, as it does under Jest.

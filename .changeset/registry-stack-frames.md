---
"vitest-native": patch
---

**Stack frames inside React Native name the real file under the native engine.** With the precompiled React Native registry, an error thrown through React Native code showed frames such as `rn-ios-<hash>.cjs:798:744`, because the registry's source map was never applied inside Vitest's workers. Each React Native module is now compiled separately under its own file name, so frames read, for example, `react-native/Libraries/vendor/emitter/EventEmitter.js:1:735`. The line and column refer to the module as compiled, the same as without the registry. No action needed; the registry rebuilds once on the first run.

A dynamic `import()` inside a React Native module now resolves from that module's file instead of failing with `ERR_MODULE_NOT_FOUND`. The registry no longer turns on Node's source-map support in workers, and no longer writes a `.map` file next to the registry.

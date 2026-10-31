---
"vitest-native": patch
---

**React Native's own modules run with the same strict-mode semantics as under Node and Jest on the native engine.** The precompiled React Native registry made every module it inlines strict, but React Native's Babel preset leaves most of its modules without `"use strict"`, so Node and Jest run them sloppy. In those modules a write to a frozen object threw a `TypeError` under vitest-native and failed silently under Jest, and `this` in a plain function call was `undefined` instead of the global object. No action needed: each module now keeps its own directive and runs with `this` set to `module.exports`, as in Node's CommonJS wrapper, and the registry rebuilds once on the first run.

`VITEST_NATIVE_NO_REGISTRY=1` already gave these semantics. The hot runtime uses the same registry and is covered too.

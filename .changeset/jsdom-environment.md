---
"vitest-native": patch
---

Fix `environment: 'jsdom'` failing to start any test worker

Vitest forwards the project's resolve conditions, including the `react-native` condition both
engines add, to each worker as Node `--conditions` flags. Vitest also loads the test environment
in that worker. jsdom depends on lru-cache, whose 11.5.3 export map names a `react-native`
CommonJS build it does not publish, so every worker failed with "Cannot find module
…/lru-cache/dist/commonjs/react-native/index.min.js". The plugin now preloads a resolver
recovery in each worker. When Node fails because a package's `react-native` export target does
not exist, the same export is resolved with the process's other conditions, as Node would
without `react-native`. Every other resolution is left exactly as Node makes it. jsdom and
happy-dom now work with both engines, with and without the hot runtime.

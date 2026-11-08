---
"vitest-native": patch
---

**A project with a Babel config no longer fails every test file when a plugin serves a module under the project root.** Most visibly: with a root `__mocks__` for an installed package and `jestMockTransform()`, each file failed with `ENOENT … vitest-native.root-mocks.mjs`. The `projectBabel` and project `.js` JSX load hooks now leave an id with no file on disk to the plugin that serves it. No action needed.

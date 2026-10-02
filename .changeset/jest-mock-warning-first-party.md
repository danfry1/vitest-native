---
"vitest-native": patch
---

Stop warning about `jest.mock()` in files the project does not own

The warning that a file calls `jest.mock()` without `jestMockTransform()` also fired on
dependencies and on vitest-native's own files: the jest-compat setup, which implements `jest.mock`,
and the plugin source, which only names it. A project using `vitest-native/jest-compat/setup`
without the transform was told to fix a file inside `node_modules/vitest-native`. The warning now
applies only to the project's own files.

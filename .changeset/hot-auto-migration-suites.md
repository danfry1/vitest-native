---
"vitest-native": minor
---

Use the hot runtime for suites migrated from Jest under `hotRuntime: 'auto'`

`'auto'`, the default, no longer keeps per-file isolation for suites set up with
`jestMockTransform()` or the jest-compat setup. The jest-compat surface — `jest.mock` in
its hoisted, partial, factory-less and runtime forms, spies on React Native APIs, `console`
and package exports, fake timers and `jest.setSystemTime`, `jest.setTimeout`, globals,
`process.env`, snapshot state, React Native Testing Library cleanup, and a project setup
file's top-level mocks, matchers and globals — now has its own cross-file isolation gate
under the hot runtime. `hotRuntime: false` keeps
per-file isolation for a suite that needs it.

---
"vitest-native": minor
---

**Files that need a plugin from your project's Babel config now compile with that config, as Metro and babel-jest compile them.** Legacy decorators (WatermelonDB models), macros, `react-native-dotenv`, the worklets plugin, custom plugins and Flow used to fail or behave differently. Remove any `babel()` entry you added only to run them; set [`projectBabel: 'never'`](https://danfry1.github.io/vitest-native/guide/plugin-options#projectbabel) for the previous behaviour.

- Only a file that uses such a plugin compiles with Babel; other files keep Oxc.
- `migrate` and `doctor` list these plugins as applied, and `doctor` calls a `babel()` entry that repeats one redundant.
- It needs `@babel/core` in the project. Without it, `migrate`, `doctor` and the mock engine's startup say so.

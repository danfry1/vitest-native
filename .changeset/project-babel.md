---
"vitest-native": minor
---

**Files that need a plugin from your project's Babel config now compile with that config, as Metro and babel-jest compile them.** Legacy decorators (WatermelonDB models), macros, `react-native-dotenv`, custom plugins and Flow used to fail or behave differently. Each file's source decides: only a file that uses such a plugin compiles with Babel, and every other file keeps Oxc. Startup names the plugins involved. Remove any `babel()` entry you added only to run them. Set [`projectBabel: 'never'`](https://danfry1.github.io/vitest-native/guide/plugin-options#projectbabel) for the previous behaviour.

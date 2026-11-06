---
"vitest-native": minor
---

**Your own source now compiles with your project's Babel config where it needs a plugin Vite's Oxc transform does not cover, as Metro and babel-jest compile it.** Legacy decorators (WatermelonDB models), macros, `react-native-dotenv`, custom plugins and Flow used to fail or behave differently. Such a file now compiles with Babel; every other file keeps Oxc, and startup names the plugins that caused it. If you added `@rolldown/plugin-babel` only to run those plugins, remove it; if you keep it, [`projectBabel`](https://danfry1.github.io/vitest-native/guide/plugin-options#projectbabel) steps aside for it. Set `projectBabel: 'never'` for the previous behaviour.

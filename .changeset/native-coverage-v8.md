---
"vitest-native": patch
---

**Native engine: `@vitest/coverage-v8` now reports the files Node compiles, such as a React Native workspace package, mapped to their source lines.** Before, it printed "Failed to parse … Excluding it from coverage" for each one and left it out of the report. No action needed.

- With `provider: 'v8'`, the plugin installs `@vitest/coverage-v8` with one change: it reads those files from the engine's transform cache, which now keeps an inline source map for files outside `node_modules`. The report still says "v8".
- Files outside the project root still need `coverage.allowExternal`. See the new Coverage guide page.

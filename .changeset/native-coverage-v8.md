---
"vitest-native": patch
---

**Native engine: `@vitest/coverage-v8` now reports the files Node compiles, such as a React Native workspace package, mapped to their source lines.** Before, it printed "Failed to parse … Excluding it from coverage" for each one and left it out of the report. No action needed.

- With `provider: 'v8'`, the plugin sets Vitest up to use `@vitest/coverage-v8` with one change: it reads those files from the engine's transform cache. While coverage is on, that cache keeps an inline source map for each file outside `node_modules`. The report still says "v8".
- Files outside the project root still need `coverage.allowExternal`. See the new Coverage guide page.

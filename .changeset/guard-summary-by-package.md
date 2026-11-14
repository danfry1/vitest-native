---
"vitest-native": minor
---

**The `SOURCE_EVALUATED_TWICE` end-of-run summary prints one line per installed package, and `diagnostics` lists every file.** Native engine. No action needed.

- Files of one installed package that Node and Vite both loaded the same way now print as one line, with the package, counts, test files and one fix. Before, a package's TypeScript source printed a line per file. The header adds the grouped count: `from 14 cause(s), 1 after grouping by installed package:`.
- With `reactNative({ diagnostics: true })`, the summary lists every file and how Node reached it.

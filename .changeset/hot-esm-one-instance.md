---
"vitest-native": minor
---

**Under the hot runtime, an ES package is one instance per test file, whether imported or required.** A `require()` of an ES module was loaded once per worker and kept apart from the file's `import` of it, so its module state carried from file to file, and under `freshRuntime` it kept the first file's React ("Invalid hook call"). Each file now gets one fresh copy. `import.meta` and reported errors name the real file, and `import.meta.resolve`, in a package or a test file, answers with the real file rather than one carrying a `?vnhot=` query. No action needed.

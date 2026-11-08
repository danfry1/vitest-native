---
"vitest-native": patch
---

**Under the hot runtime, a test file no longer fails to load with "TypeError: #<Object> is not an integer typed array".** When Vite evaluated an installed ES module that Node had already imported in the same worker, the `SOURCE_EVALUATED_TWICE` check read the hot runtime's generation from the wrong object and threw. Which file failed depended on the files that ran before it in the worker. No action needed.

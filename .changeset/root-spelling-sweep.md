---
"vitest-native": patch
---

**On Windows, a project reached through a short (8.3) path is recognised in every check that asks whether a file belongs to it.** The checks that decide whether Vite or Node loads a file, the require bridge, the warning about Node resolving the package under test, the setup-file check and `vitest-native compare` compared paths as plain strings. A root such as `C:\Users\RUNNER~1\...` then missed files Vite names by their long path. They now match a directory in each of its spellings. No action needed.

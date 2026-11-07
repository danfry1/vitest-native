---
"vitest-native": patch
---

**`projectBabel` compiles your source when the project root is reached through another spelling of its path.** A root given through a symlinked or junctioned directory, or a Windows 8.3 short name such as `C:\Users\RUNNER~1\...`, did not match the real paths Vite gives files. Decorators and other syntax your Babel config handles then failed to parse, and `.babelrc` files were not read. No action needed.

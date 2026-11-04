---
"vitest-native": patch
---

**Native engine, `hotRuntime`: a hot worker's memory no longer grows by a copy of every CommonJS package a test file imports.** Each file's copy stayed alive for the rest of the run, so a suite whose files import large packages hit `memoryLimit` and recycled workers every few files. No action needed.

- From its second file on, a package is collected once no file uses it. What stays per file is a few kilobytes per imported package.
- Packages that ship as ES modules and run in Node unchanged still keep one copy per file.
- Requires Node 22.22.3+, 24.12+ or 26. Older Node versions behave as before.

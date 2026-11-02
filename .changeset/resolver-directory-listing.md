---
"vitest-native": patch
---

**Extensionless imports into large directories resolve faster, under both engines.** No action
needed. Resolving `./Foo` across Metro's candidates (`.ios.js`, `.native.js`, `.js`, …) and its
exact-case check now reads each directory once. A test importing 2000 modules from one flat
directory went from about 4.2 s to 2.1 s; nested layouts gain a few percent. Resolution results
are unchanged, except in a directory that is readable but not searchable, where loading the file
fails with `EACCES` either way.

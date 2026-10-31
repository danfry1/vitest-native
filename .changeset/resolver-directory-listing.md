---
"vitest-native": patch
---

**Extensionless imports into large directories resolve faster, under both engines.** No action
needed. Resolving `./Foo` now reads each directory once and answers every Metro candidate
(`.ios.js`, `.native.js`, `.js`, …) and the exact-case check from that listing, instead of an
`existsSync` per candidate and a fresh `readdirSync` per match. A test importing 2000 modules from
one flat directory went from about 4.2 s to 2.1 s; nested layouts gain a few percent. Resolution
results are unchanged, and a file added or removed during `vitest --watch` is still seen.

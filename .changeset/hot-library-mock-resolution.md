---
"vitest-native": patch
---

Under the hot runtime, a library that is its own test mock, such as reanimated's since 4.7, no longer has its module graph re-resolved and its sources re-read on every test file. The hot runtime re-loads such a library in each file. Node does not cache a resolution that goes through a package's `exports` map, so each of the library's bare imports ran Node's full resolution again, and each compiled source was read again just to find its cached output. Resolutions of bare and extensionless relative requests are now kept per requiring directory for the life of the worker, as Node keeps its own package.json reads. A source whose compiled output is already held for its current size and modification time is no longer read, so a file edited between test files is still recompiled.

---
"vitest-native": patch
---

Reset hot-runtime state before a test file's own setup files run

The hot runtime restored the previous file's realm state (fake timers, stubbed
globals and environment, listeners) from this package's setup file, which Vitest
runs after the project's own setup files. A project setup file that installs fake
timers therefore found the previous file's timers still installed and failed with
"Can't install fake timers twice", failing every file after the first. The reset
now runs at the file boundary, before any setup file.

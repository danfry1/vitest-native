---
"vitest-native": patch
---

**A project whose root reaches Vitest under another spelling of the same directory no longer fails with "the project context is invalid".** No action needed. On Windows one directory has more than one spelling (`C:\Users\RUNNER~1` and `C:\Users\runneradmin`), and a symlinked root is another; the check that each project runs with its own context compared the two as strings. It now compares the directories they name.

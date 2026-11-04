---
"vitest-native": patch
---

**Under the native engine, compiling a file no longer fails at random with "Babel's thread has not answered in 60 s" on a busy machine.** Babel's thread wakes the caller after it stores each answer. If that wake-up was delayed past the caller's next request, it ended the wait for that request before Babel had answered. The file then failed at once, however small it was and well short of the deadline. The caller now waits until the answer itself is there. No action needed.

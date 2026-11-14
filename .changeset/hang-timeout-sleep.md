---
"vitest-native": patch
---

**`hangTimeout` no longer stops a run because the machine slept.** On macOS, Node's timers count time asleep, so after a sleep mid-run every running test looked past its budget and the run was stopped on wake. Time the machine spends asleep now extends each limit instead, while a test stuck in synchronous code is still caught once its awake time runs out. No action needed.

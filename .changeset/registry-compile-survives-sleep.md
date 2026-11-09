---
"vitest-native": patch
---

**A machine going to sleep mid-run no longer slows the run that follows.** On macOS, Node's clocks count time asleep, so precompiling React Native looked like it had overrun its time limit and was stopped on wake. The run then loaded React Native file by file, and its duration, which included the sleep, read as a stall of over ten minutes. Time limits now leave out time the machine spends asleep, and a precompile that still fails says how long the machine slept. A run also stops retrying a precompile that has already failed. No action needed.

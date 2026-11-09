---
"vitest-native": patch
---

**A machine going to sleep mid-run no longer fails the React Native registry compile.** On macOS, Node's clocks count time the machine spends asleep, so the compiler and its parent saw a sleep as a compile that had run past its deadline. On wake the compiler was killed, and the run fell back to per-file loading. The run's duration also included the sleep, so it read as a stall of over ten minutes. The compiler's deadlines now leave out time asleep, measured as ticks that arrive far later than their interval while the process used almost no CPU. A compile that does fail says how long the machine slept during it. Once a registry's compile has failed, later projects and config reloads in the same run fall back at once instead of compiling it again. No action needed.

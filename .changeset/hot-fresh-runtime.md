---
"vitest-native": minor
---

**The hot runtime can run React, its renderers, `scheduler` and RNTL fresh in every file (experimental).** Set `hotRuntime: { freshRuntime: true }` so `useId` values, React's once-per-process warnings, an `act()` scope an earlier file left open, and the scheduler's timers no longer carry from one file to the next. It costs about 5 ms per file at four workers. It needs `esmGeneration`, which is on by default.

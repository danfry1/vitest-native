---
"vitest-native": minor
---

**A test stuck in synchronous code now fails the run within a minute, naming the file and test, instead of hanging it forever.** Vitest's `testTimeout` can't interrupt a test that never yields, such as a loop that never ends, so such a run used to wait with nothing on screen. The new `hangTimeout` option fails a run when no test has started or finished for 60 s, or for twice the larger of `testTimeout` and `hookTimeout` if that is longer. It's off while a debugger is attached. Add `reactNative({ hangTimeout: <ms> })` if a test of yours legitimately runs longer than that while nothing else finishes, or `hangTimeout: false` to turn it off.

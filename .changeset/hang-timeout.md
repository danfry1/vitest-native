---
"vitest-native": minor
---

**A test stuck in synchronous code no longer hangs a hot-runtime run forever: the run fails and names the file and test.** Vitest's `testTimeout` can't interrupt a test that never yields, such as a loop that never ends, so such a run used to wait with nothing on screen. The new `hangTimeout` option fails a run when nothing has made progress for 60 s (or twice the longest test or hook timeout) and every running test is past its own timeout, retries included. It's on by default under the hot runtime and off otherwise. Add `reactNative({ hangTimeout: <ms> })` to turn it on everywhere, or `hangTimeout: false` to turn it off.

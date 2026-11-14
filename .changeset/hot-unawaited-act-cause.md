---
"vitest-native": patch
---

**With one worker, a file that inherits an open `act()` scope now says when the cause is an un-awaited `act()`.** Add `await` to the `act()` call (or the RNTL call that wraps it) in the file the message names. Under `hotRuntime` with one worker, the `HOT_RESIDENT_UNUSABLE` message previously described every open scope as a likely timeout. When no test in the file that left it failed while the scope was open, it now names an `act()` call there that was not awaited. The wait for the scope to close is unchanged.

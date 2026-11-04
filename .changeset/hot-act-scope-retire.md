---
"vitest-native": patch
---

**`hotRuntime`: a test that times out inside `act()` no longer fails every later file on its worker.** Those files failed with `Unable to find an element with text: …`. The worker is now replaced after that file, and the timed-out test names the open `act()` scope. No action needed.

- With one worker the worker cannot be replaced: the next file waits up to `testTimeout` for the scope to close, then the remaining files fail naming the cause.

Thanks @sincraianul for reporting this (#449).

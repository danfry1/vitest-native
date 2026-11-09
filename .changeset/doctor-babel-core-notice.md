---
"vitest-native": patch
---

**`vitest-native doctor` reports a missing `@babel/core` with the engine's own startup notice, once.** It then lists each Babel plugin or preset that therefore goes unapplied, instead of repeating the install advice on every line. No action needed.

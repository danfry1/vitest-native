---
"vitest-native": patch
---

**A Reanimated derived value from a render React discards no longer keeps running, and an updater that writes a value it reads no longer recurses.** `useDerivedValue` started following its inputs during render, so a render React discarded (a Suspense throw, an error boundary) kept its updater running on every later write. It now follows them once the component commits, as Reanimated starts its mapper in an effect. An updater that wrote a value it reads overflowed the stack; the write now waits for the next change to one of its inputs. No action needed.

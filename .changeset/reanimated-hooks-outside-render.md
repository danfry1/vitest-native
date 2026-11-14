---
"vitest-native": patch
---

**The Reanimated preset's corrected hooks still answer outside a render, as Reanimated's own Jest mock does, and now let every other error through.** No action needed. They answer only on React's own outside-a-render signals; any other error from React is thrown. React gives the same "Invalid hook call" error for a hook called in a class component, inside an effect or event handler, or after another copy of React has rendered, so those calls also get a fresh value here, where real Reanimated would throw.

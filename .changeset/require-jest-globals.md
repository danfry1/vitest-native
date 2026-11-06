---
"vitest-native": patch
---

**`require('@jest/globals')` gets jest-compat's shim, as an import does.** A CommonJS `require` of it reached the installed package, which throws outside Jest, so a `.js` test that required it did not load. It now returns the same module as `import … from '@jest/globals'`, under both engines.

No action needed.

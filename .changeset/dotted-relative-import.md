---
"vitest-native": patch
---

**Under the native engine, a relative import whose name has a dot, such as `./Linking.types`, now resolves.** A package that Node loads as an ES module failed with "Cannot find module …/Linking.types" because the part after the dot was read as a file extension. Only a known source or asset extension counts now, as in Metro, so `./Linking.types` finds `Linking.types.js`, and a platform variant such as `Theme.config.native.js` wins over `Theme.config.js`. No action needed.

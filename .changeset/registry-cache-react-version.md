---
"vitest-native": patch
---

Rebuild the React Native registry when React changes

Upgrading React while staying on the same React Native served a precompiled registry
built against the previous React. The native engine then failed in ways that look
nothing like a stale cache:

```
TypeError: Cannot read properties of null (reading 'useContext')
AssertionError: expected [Function Dimensions] to be [Function Dimensions]
```

— a null React dispatcher and React Native singletons that no longer compare equal,
which is the duplicate-instance failure the registry exists to prevent.

The registry is disk-cached under `node_modules/.cache/vitest-native` and keyed on
React Native, `@babel/core`, `@react-native/babel-preset`, the platform, and this
package's own version. `react` was missing, and the manifest check could not stand in
for it: that stats React Native's own files, which do not change when React alone is
upgraded. The cache was therefore reused when it should not have been, and deleting
the cache directory by hand was the only way out.

`react` is now part of the key. Because the failure is self-clearing on a later run,
it was easy to read as flakiness rather than as a stale cache.

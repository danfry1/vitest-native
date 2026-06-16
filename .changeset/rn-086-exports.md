---
"vitest-native": patch
---

Add mocks for react-native 0.86 top-level exports

The weekly compatibility check flagged new stable exports in react-native 0.86.
`EventEmitter`, `useAnimatedColor`, and `useAnimatedValueXY` are now mocked so
named imports resolve under the mock engine. The experimental virtualized-collection
API (`unstable_VirtualRow`, `unstable_createVirtualCollectionView`, and related)
is added to the compatibility check's known-skipped list.

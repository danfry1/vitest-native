---
"vitest-native": patch
---

Add `LayoutAnimation.easeInEaseOut()`, `.linear()`, `.spring()`, `.setEnabled()` and `.checkConfig()` to the mock engine

The preset shortcuts were missing entirely, so `LayoutAnimation.easeInEaseOut()` — the
idiomatic one-liner in a React Native codebase — threw "is not a function" under the
mock engine while the same call worked under the native one. They now bind to
`configureNext` with the matching preset, exactly as React Native defines them, so a
test asserting on `configureNext` sees the call either way.

Found by diffing the mock's member list against real React Native's across every mocked
namespace. A behavioural test cannot catch a member that is not there, so the
cross-check corpus now covers this shape too.

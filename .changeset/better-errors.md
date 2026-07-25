---
"vitest-native": patch
---

Name the cause of two failures that used to arrive unexplained

A suite calling `jest.mock()` without `jestMockTransform()` in its plugins now says so.
Vitest only hoists mocks written on the `vi`/`vitest` identifier, so the call runs after
the imports it is meant to intercept and the mock silently does not apply — the test
fails comparing real output against expected mock output, with nothing pointing at the
cause. Reported once per run, with the config line to add.

Two resolvable copies of React are now reported at startup. React throws
`Cannot read properties of null (reading 'use')` when hooks run through a second copy,
which React Native Testing Library surfaces as a failure to detect host component names
and attributes to "an issue with your configuration". The warning names both paths and
which package pulled the second copy in. `resolve.dedupe` still prevents the common
case; this covers the ones it cannot reach.

Two existing messages also say more: an unknown `hotRuntime` option now suggests the
closest valid name and lists them all, matching what the top-level option check already
did, and the reanimated preset explains why a React Native component was unavailable
instead of only stating that it was.

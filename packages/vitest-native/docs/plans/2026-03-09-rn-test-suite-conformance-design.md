# RN Test Suite Conformance Design

## Goal

Port React Native's own test files to run against vitest-native's mocks, proving behavioral parity with the strongest possible evidence: RN's own assertions.

## Why

- "Passes React Native's own test suite" is the most credible reliability signal
- Catches edge cases RN's authors know about that we wouldn't think to test
- Enables drift detection when RN releases new versions

## Approach: Hybrid (scripted transform + human review)

A `scripts/port-rn-tests.ts` script handles the mechanical parts:
1. Strip Flow types via `flow-remove-types`
2. Replace `jest.*` → `vi.*`
3. Output to `tests/rn-conformance/`

Human review handles:
- Rewriting internal imports → public API imports
- Skipping tests that probe native internals
- Commenting tests that can't pass due to architectural differences (mocks vs real RN)

## Scope

### 27 GREEN files (directly portable)

**Animated/Math (7):**
- Easing-test.js, bezier-test.js, Interpolation-test.js, TimingAnimation-test.js
- AnimatedMock-test.js, AnimatedObject-test.js, AnimatedProps-test.js

**StyleSheet (4):**
- flattenStyle-test.js, StyleSheet-test.js, processTransform-test.js, setNormalizedColorAlpha-test.js

**Utilities (11):**
- Dimensions-test.js, PixelRatio-test.js, Platform-test.js, EventEmitter-test.js
- deepDiffer-test.js, deepFreezeAndThrowOnMutationInDev-test.js, stringifySafe-test.js
- mapWithSeparator-test.js, warnOnce-test.js, DeviceInfo-test.js, useRefEffect-test.js

**Other (5):**
- BlobRegistry-test.js, URL-test.js, JSTimers-test.js, binaryToBase64-test.js
- NativeAnimatedAllowlist-test.js

### What we skip

- Tests using `jest.resetModules()` (different module isolation model)
- Tests importing RN internals directly (`require('../nodes/AnimatedValue')`)
- Tests probing NativeAnimatedModule bridge behavior
- Snapshot tests (different serializer)

## File structure

```
tests/rn-conformance/
  rn-Easing.test.ts
  rn-bezier.test.ts
  rn-flattenStyle.test.ts
  ...
scripts/
  port-rn-tests.ts
```

## Success criteria

- Each ported file either passes or reveals a genuine mock gap that gets fixed
- Failures from architectural differences get skipped with a comment explaining why
- The conformance suite runs as part of the normal `vitest` test run

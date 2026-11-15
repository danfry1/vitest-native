# 0014-c. Fix per-file memory growth at the named retainer, and keep resident mocks free of per-file values

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/scripts/test-hot-memory.mjs`, `packages/vitest-native/lint/vitest-native-rules.mjs`, `packages/vitest-native/tests/lint-rules.test.ts`, `packages/vitest-native/tests/presets-hold-no-react.test.ts`
- **Related:** [0014-a](0014-a-admit-hot-only-when-recyclable.md), [0014-d](0014-d-matcher-registry-flag-only.md)

## Decision

Heap growth per file under hot is fixed where it is retained, not hidden by recycling.
Resident boundary mocks and preset modules never close over a per-file value: a preset
factory takes React from its context, not from a module it imported once per worker. A
heap-slope gate fails a change that lets the heap grow per file.

## Context

On a fresh-world prototype the heap grew 538 KiB per file after GC; 84% of that was
chai's module-level `used` list. Registering each matcher once per worker brought it to
79 KiB, and a weakly held spy to 56 KiB. On main, where React Native and RNTL are already
resident, growth was 51–56 KiB per file, and about 45 KiB of it is still unattributed
(most likely retained ESM module records). Evidence kept privately.

Under `hotRuntime.freshRuntime` each file has its own React, so a preset that kept the
first file's React breaks every later file (#719). The `preset-react-per-file` lint rule
and `presets-hold-no-react.test.ts` catch direct and indirect cases.

## Consequences

- **Gains:** per-file worlds stay viable on memory; growth has a name and a gate.
- **Costs:** every resident mock is written against a context object, not module scope.
- **Limits:** recycling options remain as a backstop (see 0016-c), not as the fix.

## Alternatives rejected

- Recycling as the fix: cannot run at one worker, and hides the growth.
- Patch `@vitest/spy` 4.x: about 2% of the growth, and fixed upstream in 5.x, which is
  now the supported floor.

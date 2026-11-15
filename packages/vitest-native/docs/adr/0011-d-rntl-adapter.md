# 0011-d. Give RNTL its Jest-only environment, bound to the current file, through one adapter

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/rntl-hooks.test.ts`, `packages/vitest-native/tests/rntl-timers.test.ts`, `packages/vitest-native/tests/rntl-text-host.test.ts`
- **Related:** [0011-c](0011-c-scoped-jest-for-library-support.md), [0008-a](0008-a-small-resident-renderer-set.md)

## Decision

One adapter file covers each supported RNTL major: host-text names including
`RCTVirtualText`, `cleanupAsync ?? cleanup`, and timer detection. RNTL's own files get a
`jest` and test hooks (`afterEach`, `beforeAll`, `afterAll`) bound to the current file, as a
function parameter. RNTL's internals are not patched.

## Context

RNTL 12.9, 13.3 and 14.1 detect fake timers through a free `typeof jest` and register cleanup
through a free `typeof afterEach`. Without a `jest` in scope, `waitFor` and `findBy*` poll with
a `setInterval` that Vitest has faked, so they time out under `vi.useFakeTimers()`. Under
the hot runtime RNTL is resident, so its entry ran once and later files got no cleanup.

## Consequences

- **Gains:** `findBy*` works under fake timers; each file that imports RNTL gets RNTL's own cleanup.
- **Costs:** one adapter to update per RNTL major.
- **Limits:** other libraries still see Vitest's `globals` setting: a documented divergence.

## Alternatives rejected

- Patch RNTL internals: breaks silently when RNTL changes.

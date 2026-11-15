# 0011-c. Give a library's own test-support files a `jest` of their own, never a global one

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests-native/library-jest.test.ts`, `packages/vitest-native/tests-native/library-jest-import.test.ts`, `.github/workflows/ci.yml`
- **Related:** [0012-b](0012-b-library-own-test-support-first.md) (depends on this), [0007-b](0007-b-keep-node-require-precedence.md)

## Decision

A library's support files (its `jestSetup`, its `mock` entry, files under its `jest/`
directory) get `jest` as a function parameter around their compiled code. Its `jest.mock`
writes to the per-file Node registry, `jest.requireActual` bypasses preset shadows, and its
`jest.fn` implementations survive `mockReset`. `globalThis.jest` is never touched.

## Context

Libraries ship test support written for Jest. Under Vitest a global `jest` is `vi`, whose
`mock` never reaches Node's `require`, and library files are not compiled by the jest-compat
transform, so such setup files ran and changed nothing. Jest's module wrapper passes `jest`
to every module; a parameter does the same without a global.

## Consequences

- **Gains:** libraries' own mocks and setup files work as their maintainers intended.
- **Costs:** support files are recompiled with a wrapper.
- **Limits:** under plain `isolate: false`, a cached support entry never runs again and its registrations stay with the module.

## Alternatives rejected

- A conditional global `jest`: a hidden mode, and RNTL reads `typeof jest` to decide whether it runs under Jest.

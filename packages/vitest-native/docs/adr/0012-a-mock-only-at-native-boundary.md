# 0012-a. Mock only at the native boundary, a strict subset of React Native's Jest setup

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/native-unit.test.ts`
- **Related:** [0012-b](0012-b-library-own-test-support-first.md)

## Decision

Under the native engine, only the React Native modules that touch native code are replaced,
and that set stays a strict subset of what `react-native/jest/setup.js` mocks. Everything
else in React Native runs as itself.

## Context

Hand-written stand-ins for React Native's JavaScript drift from the real thing. RN's own Jest
setup already defines where the native layer starts, and Jest users' tests pass against
that line.

## Consequences

- **Gains:** fidelity follows React Native's own maintainers; real RN JavaScript runs above the boundary.
- **Costs:** each RN upgrade can move the boundary, and the set is checked against it.
- **Limits:** behaviour that depends on native code returns RN's mock values, as under Jest.

## Alternatives rejected

- Hand-written mocks of RN components and APIs: they miss names and drift.

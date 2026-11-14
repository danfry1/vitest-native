# 0002-f. Vary configuration axes in an advisory matrix until it is calibrated

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: the matrix runs on every pull request, advisory, over Vitest 5, RNTL, install layout, engine, globals, hot runtime and jest-compat; Expo and multi-project cells are absent.
- **Enforced by:** `.github/workflows/config-axis-matrix.yml`, `packages/vitest-native/tests/config-axes.test.ts`, `packages/vitest-native/validation/config-axes/known-failing.json`
- **Related:** [0002-b](0002-b-bug-museum.md)

## Decision

A matrix varies the configuration choices a project makes and runs behaviour probes in each
cell. It stays advisory until calibrated: one negative control per probe, and every entry
proven by mutation. No configuration axis is deleted without a calibrated matrix plus a
per-test compare across the axis values. The refactor gate includes the cells where past bugs
lived, such as pnpm with Expo, globals off with RNTL, and hot runtime with jest-compat.

## Context

About sixteen defects sat on one or two configuration choices that no fixture varied, while
every gate was green. A matrix that is required before it is calibrated would block changes
on its own false failures.

## Consequences

- **Gains:** defects that sit on a configuration axis fail CI instead of a user's migration.
- **Costs:** CI time per pull request; a known-failing list that may only shrink.
- **Limits:** none for users. It is not a required check until the maintainer decides it is
  calibrated.

## Alternatives rejected

- Fixed-configuration fixtures only: that is how the axis defects shipped.
- A required matrix from day one: uncalibrated probes would block unrelated changes.

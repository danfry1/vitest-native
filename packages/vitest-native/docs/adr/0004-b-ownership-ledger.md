# 0004-b. Report any file evaluated by both module systems, as a warning for users and an error in CI

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: `SOURCE_EVALUATED_TWICE` with `warn`/`error` modes and a reasoned `allow` list is on main, and the native suites run in `error`; `SINGLETON_SPLIT` and its singleton list are absent.
- **Enforced by:** `packages/vitest-native/tests/ownership-ledger.test.ts`, `packages/vitest-native/tests-native/ownership-guard.test.ts`
- **Related:** [0004-a](0004-a-owner-per-package.md) (the predicate it backs up)

## Decision

A ledger records every module instance by physical identity (its real path) and runtime
identity (which module system evaluated it, and the package directory it was resolved from,
which for pnpm is the peer-variant directory). Two checks fail by name:
`SOURCE_EVALUATED_TWICE`, one physical file with two runtime identities; and `SINGLETON_SPLIT`,
a package on an explicit singleton list (`react`, `react-dom`, `scheduler`, `react-is`, RNTL's
renderer, `react-native`, `@testing-library/react-native`) with two runtime identities,
whatever the paths or versions. Other packages may have several instances and are recorded,
not failed. The user option `reactNative({ ownership })` defaults to `warn`; CI runs `error`.
An intended duplicate needs an `allow` entry with a reason.

## Context

The ledger is the backstop for routes the predicate cannot prevent, and it is blind to JSON,
threaded-loader ESM, `isolateModules`, `?query` ids and swallowed optional-require throws, so
the predicate must be right there by construction. One React split that broke 126 tests was
two Node instances of React, which a Node-versus-Vite check alone cannot see. A key on
(package name, version) was replaced because it missed that case and flagged legitimate pnpm
peer variants.

## Consequences

- **Gains:** a silent dual instance becomes a named warning or failure.
- **Costs:** recording identity on every load.
- **Limits:** `SOURCE_EVALUATED_TWICE` is documented in the errors guide; detection cannot be
  turned off.

## Alternatives rejected

- The ledger alone, with no predicate: blind to the routes listed above.
- Duplicate detection by (name, version): misses same-version splits and fails on pnpm peer
  variants.

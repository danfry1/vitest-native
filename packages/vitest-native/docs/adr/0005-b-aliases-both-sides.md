# 0005-b. Apply aliases on both sides, for every requester, as Jest's moduleNameMapper does

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: only under `experimental.ownershipModel`, where RegExp aliases and tsconfig `paths` reach Node's side; an alias a worker cannot apply is refused at startup rather than warned about.
- **Enforced by:** `packages/vitest-native/tests-native/vitest.regex-alias.config.mts`, `packages/vitest-native/tests/tsconfig-path-aliases.test.ts`, `packages/vitest-native/tests/require-actual-aliases.test.ts`, `packages/vitest-native/validation/bug-museum/exhibits/own-alias-regex`
- **Related:** [0005-a](0005-a-shared-resolver.md) (depends on)

## Decision

The shared resolver applies every alias (Vite's `test.alias` and `resolve.alias`, then
tsconfig `paths`) on both sides and for every requester, including installed libraries, as
Jest's `moduleNameMapper` does. An alias the resolver cannot represent, such as a custom
resolver, is reported by name.

## Context

Node-side aliases applied only to strings, only for project parents, and only after a failed
lookup. An aliased workspace package therefore loaded as two stores, one per side, and
`jest.requireActual` could not follow RegExp aliases at all.

## Consequences

- **Gains:** one answer per alias on both sides; `jest.requireActual` follows aliases.
- **Costs:** aliases now reach libraries too, as they do under Jest, which can change what a
  library resolves.
- **Limits:** a function replacement or custom resolver in an alias is refused by name at
  startup.

## Alternatives rejected

- Keep Node-side alias patches for project files only: the source of the dual-store bugs.

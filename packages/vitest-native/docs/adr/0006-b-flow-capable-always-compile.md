# 0006-b. Always compile TypeScript, Flow and react-native-field files, without a parse check

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: `.ts`, `.tsx`, `.mts` and `.cts` always compile, and React Native's own Flow files compile; a file in a selected package with an `@flow` pragma or a `react-native` manifest field still goes through the parse check.
- **Enforced by:** `packages/vitest-native/tests/needs-transform.test.ts`
- **Related:** [0006-a](0006-a-compile-verdict.md) (the check these bypass)

## Decision

These files are compiled with no parse check: TypeScript extensions, files with an `@flow`
pragma, and every file in a package whose manifest has a `react-native` field.

## Context

"Parses as a script" is not "is CommonJS". TypeScript's `useState<string>('')` parses as
JavaScript, and Flow's call type argument `f<T>(x)` parses as `(f < T) > x`, so the parse check
would hand both to Node with a silently different meaning.

## Consequences

- **Gains:** no silent change of meaning for Flow and TypeScript syntax that happens to parse.
- **Costs:** every file in `react-native`-field packages compiles; the cold-transform count
  shows the delta, with a kill criterion at more than 10% on obytes.
- **Limits:** none visible beyond compile time.

## Alternatives rejected

- Run the parse check on Flow-capable files: `f<T>(x)` silently means something else.

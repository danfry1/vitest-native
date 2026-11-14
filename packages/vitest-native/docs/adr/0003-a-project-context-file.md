# 0003-a. Pass each project's configuration to workers as one validated context file

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/context.test.ts`, `packages/vitest-native/tests-native/vitest.context.config.mts`, `packages/vitest-native/tests-native/vitest.shared-root.config.mts`
- **Related:** [0003-b](0003-b-single-global-handle.md), [0004-a](0004-a-owner-per-package.md) (reads it), [0005-a](0005-a-shared-resolver.md) (its resolver inputs live in it)

## Decision

The main process computes one frozen `ProjectContext` per Vitest project and writes it to a
content-addressed file in the cache directory. Workers find it through one environment
variable, `VITEST_NATIVE_CONTEXT=<path>#<key>`, and the threaded loader receives the same
reference through `register()` data. A bad context fails with `CONTEXT_INVALID`, naming the
reason (`missing`, `schema`, `version`, `key`, `project`) and the field. Each file's project is
checked against the worker's boot context in memory. Workers read no other `VITEST_NATIVE_*`
variable except named diagnostic escape hatches.

## Context

Configuration reached workers through 27 `VITEST_NATIVE_*` variables and 27 globals, with nine
parse errors swallowed in empty catches and the ownership policy built in five places. A
memory plan was once sized from the config instead of the resolved worker count, and the
system failed open rather than by name. Vitest 4.1 and 5 already refuse to reuse a runner
across projects (`isEqualRunner`), so the per-file project check is a backstop, with a fixture
of an iOS and an Android project at one root as its regression gate.

## Consequences

- **Gains:** configuration fails loudly; `doctor`, `explain` and the banner read one object.
  `VITEST_NATIVE_*` names fell from 27 to 5.
- **Costs:** a stale context now fails the run instead of limping on.
- **Limits:** `CONTEXT_INVALID` names the reason and field. Three diagnostic escape hatches
  remain environment variables. The planned size budget (≤ 64 KiB on obytes) is not checked.

## Alternatives rejected

- Keep the environment variables and only stop swallowing errors: leaves 27 channels.
- The whole context in one JSON environment variable: Windows limits environment size, and a
  file can be inspected.
- One context per workspace root: iOS and Android projects can share a root.

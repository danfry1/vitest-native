# 0013-c. Keep the module loaders free of per-file decisions

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** Review only
- **Related:** [0013-a](0013-a-per-file-esm-generation.md)

## Decision

The threaded ESM loader and the in-thread loader decide nothing per test file. They may
run the shared resolver, read the static ownership verdict, and read the generation
counter; nothing else.

## Context

Per-file decisions in a loader hook are invisible to the rest of the engine and differ
between the threaded and in-thread paths, so a file can be owned or stamped one way on
one path and another way on the other. Which file is stamped is already a function of
the ownership policy (`tests/loader-generation-stamp.test.ts` checks that for the
stamping case), so the loader needs no state of its own beyond the counter.

## Consequences

- **Gains:** both loaders give the same answer for the same file; ownership changes are
  made in one place.
- **Costs:** a behaviour that seems to need a per-file decision in a loader has to be
  moved into the ownership verdict or the resolver first.
- **Limits:** none visible to users.

## Alternatives rejected

- Let each loader keep its own per-file rules: two copies of the ownership logic that
  drift apart.

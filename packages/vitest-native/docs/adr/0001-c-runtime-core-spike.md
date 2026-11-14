# 0001-c. Build the runtime core only if a throwaway spike beats the in-place baseline

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** No: no spike has run on main; it waits until the resident-core mitigations have been measured.
- **Enforced by:** Review only
- **Related:** [0001-a](0001-a-build-in-place.md) (the exception to it), [0007-a](0007-a-one-node-dispatcher.md) (a real build comes after it)

## Decision

The runtime core (per-file module worlds) is the only piece built in parallel, and it is first
built as a throwaway spike on current main. Its baseline is the hot runtime with the resident-
core changes applied. It is built for real only if it beats that baseline, and only after the
Node dispatcher has landed.

## Context

Every other layer of the target architecture could be reached by refactoring in place. The
runtime core could not be shown either way: a 301-line prototype existed as a flag on an old
branch, and porting it conflicted with about 360 lines of main. A spike with a pass, fail or
inconclusive verdict settles the question without committing the codebase to it.

## Consequences

- **Gains:** the one uncertain layer is tested before anyone maintains it; the in-place plan
  continues meanwhile.
- **Costs:** the spike's work is discarded whatever the result.
- **Limits:** none for users while it is a spike.

## Alternatives rejected

- Build the runtime core directly in place: the evidence for it is too thin.
- Drop it without measuring: the hot runtime's enumeration-based reset keeps producing leaks,
  so the question has to be answered.

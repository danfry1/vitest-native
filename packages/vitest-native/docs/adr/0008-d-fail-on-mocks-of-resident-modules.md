# 0008-d. A mock of a resident module fails loudly in reuse modes

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** No: there is no `MOCK_OF_RESIDENT_MODULE` check on main.
- **Enforced by:** Review only
- **Related:** [0008-a](0008-a-small-resident-renderer-set.md) (depends on)

## Decision

In a reuse mode, a `vi.mock` or `jest.mock` of a resident key (React, scheduler, react-is or
the renderer) fails the file with `MOCK_OF_RESIDENT_MODULE` and a remedy. This applies under
the `'auto'` default too, where the user never chose the hot runtime.

## Context

A resident module is loaded once per worker, so a per-file mock of it either does nothing or
leaks into every later file on that worker. Both outcomes differ from Jest, where each file
has its own registry. Failing loudly is the only answer consistent with "never fail
silently". A follow-up, still open: under `'auto'`, scan the run's hoisted mock specifiers
and decline the hot runtime for a project that mocks a resident key; its scan cost is
unmeasured.

## Consequences

- **Gains:** no silent wrong-file behaviour from mocking React.
- **Costs:** fails some files that pass under Jest.
- **Limits:** users see `MOCK_OF_RESIDENT_MODULE`; the remedy is `hotRuntime: false` for that project.

## Alternatives rejected

- Let the mock apply to the first file only: a silent divergence that depends on file order.

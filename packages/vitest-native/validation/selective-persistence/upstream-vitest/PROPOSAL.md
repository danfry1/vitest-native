# Upstream Vitest decision brief

**Status:** discussion-grade evidence; no external action taken
**Source prototype:** Vitest `1c00c94686ff6f96ec756503ed765b31068692a8`

## Recommendation

Open a focused design discussion before a pull request. Lead with **full Vite module
isolation in a reused worker**. Do not lead with React Native, a persistent capsule or
`preserveActual`.

The implementation seam and behavior are demonstrated. The remaining decision is
Vitest's public vocabulary and initial pool scope, and `isolate` currently influences
scheduling, coverage, project ordering and pool reuse. Maintainer alignment before a
named API will make the eventual PR smaller and easier to review.

## V1 request

```ts
test: {
  isolate: "modules";
}
```

Provisional semantics:

- share worker/realm;
- reset mocks and all evaluated Vite modules before each file;
- keep external Node cache behavior unchanged;
- preserve a task boundary for each file so workers can be recycled;
- target Node threads and forks first;
- preserve coverage attribution.

The retained patch is
`../../module-isolation/vitest-module-isolation.patch`; the full evidence report is
`../../module-isolation/README.md`.

## Why this is the right unit

Current production hot already keeps React Native in a Node CommonJS registry. Its
unsupported Vitest machinery exists to reuse the worker while resetting the Vite
graph. Moving RN into Vitest's graph would additionally require persistent actuals,
but that prototype did not beat hot and still externalized React.

The full-reset primitive deletes the private module-node reset without requiring
Vitest to solve selective closure retention. It is also independently useful to any
integration that can own expensive external/process state but needs fresh Vite
consumers and mocks.

## Patch shape

Production source changes are deliberately small:

1. widen user config to accept the named mode and document it;
2. normalize it to internal `moduleIsolation: true` plus resolved `isolate: false`;
3. serialize the internal flag to workers;
4. run existing mock/module reset at the per-file lifecycle boundary;
5. keep one-worker files as separate tasks rather than batching them;
6. expose matching CLI parsing.

No new reset algorithm, graph traversal or private runner hook is introduced.

## Required evidence before posting

Immediately before opening a discussion:

1. rebase the patch onto current Vitest main;
2. rebuild Vitest;
3. rerun lint, root typecheck and diff checks;
4. rerun the CLI, 10-contract and 31-coverage gates;
5. rerun the package-free 500-file benchmark and shared negative control;
6. rerun at least the packed RN hot-shaped and two-project gates;
7. attach exact environment and raw commands;
8. verify the discussion text still describes the patch exactly.

Do not make the RN benchmark the justification for a general API. Use it as evidence
that a real integration consumes the primitive.

## Expected maintainer questions

### Why overload `isolate`?

The behavior is an isolation mode: realm shared, modules isolated. A separate
`moduleIsolation` boolean could be less invasive but creates invalid/confusing
combinations with `isolate: true/false`. Present the named mode as a tested suggestion,
not a demand.

### Why not a runner hook?

The scheduler must know files need separate task boundaries even though the realm is
shared. A hook alone leaves every runner to manipulate evaluated module state and
cannot express recycling needs to grouping logic.

### Why not preserve modules now?

Selective persistence requires dependency-closure retention, explicit promise state,
query/virtual-id matching, mock-boundary rules and importer cleanup. It is unnecessary
for the validated consumer and can be designed later without blocking the simpler
mode.

### What does this not isolate?

JavaScript realm state and external Node caches. Tests intentionally demonstrate fake
timer and global leakage, followed by setup-file restoration. The name must be
documented as module isolation, not a fresh process guarantee.

### Why separate one-worker tasks?

Batching makes memory limits and `canReuse()` ineffective until the entire suite
finishes. Real RNTL-heavy suites retain heap across files in both current hot and the
new mode. Separate tasks allow a stock pool worker to recycle at a safe threshold.

## PR readiness

After maintainer alignment, confidence in implementing a strong PR is **high**. The
prototype already passes source build/type/lint, focused behavioral tests and coverage
and has a small runtime diff.

Confidence that the current API name will be accepted unchanged is **medium**. That
is why discussion precedes PR.

Confidence that Vitest must land this before vitest-native can be production-quality
is **low**: current hot already works and remains the fallback. Upstream removes the
custom worker/private graph-reset rows; it does not define RN semantics, Metro parity,
native boundaries, Expo support or memory/state policy.

## Later research

Keep the selective-persistence reproduction as a separate appendix. If Vitest later
wants persistent actuals, propose a core reset operation over a durable resolved-id
set rather than asking runner authors to traverse module closures themselves. Require
query/virtual ids, dependency mocks, rejection, invalidation and hung-promise gates.

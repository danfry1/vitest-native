# 0004-a. Decide each module's owner per package, before resolution, with a total predicate

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: `decideFile` exists but still falls through to a `vitest-default` owner and has no `preset` owner, and the owner is not decided before the file is resolved.
- **Enforced by:** `packages/vitest-native/tests/ownership-policy.test.ts`, `packages/vitest-native/tests/ownership-rules.test.ts`, `packages/vitest-native/validation/bug-museum/exhibits/own-pnpm-store-peer-name`
- **Related:** [0003-a](0003-a-project-context-file.md) (depends on), [0005-a](0005-a-shared-resolver.md) (picks the file after this picks the owner), [0004-b](0004-b-ownership-ledger.md) (the backstop)

## Decision

For a bare request the resolver first finds the package directory (only the `node_modules`
lookup and aliases), then `decideFile(key) → { owner: 'node' | 'vite' | 'preset', compile,
rule, reason }` gives the owner from its real path, and only then is the file picked with the
owning side's conditions. The predicate is total and pure, first match wins, with no
`vitest-default`: active preset shadow → preset; test entry outside `node_modules` → Vite;
test runtime, React Native core, registry externals, installed packages (including pnpm and
bun store layouts) and user `server.deps.external` patterns → Node; workspace members that
declare `react-native`, with their workspace-dependency closure, → Node with the project's
Babel; other workspace source and anything outside the workspace → Vite. Names match whole
path segments only.

## Context

The invariant is one owner per module instance; the same file loaded by Vite and by Node is
two instances even at an identical path. The fall-through owner covered React and RNTL, and
the rule was enforced only when Vite transformed a Node-owned file. Bugs followed: an aliased
workspace package became a silent dual store, a partial mock compiled a second copy, isolated
installs dropped transitive dependencies, and a substring match hit a pnpm store directory.
Five of 14 ownership exhibits still failed after the alias fix, which matched by name.

## Consequences

- **Gains:** the twin class closes for every listed route; the alias and workspace detection
  branches and the Node-side warnings can be deleted.
- **Costs:** installed packages are Node-owned, so for dual-export packages the `require`
  answer wins on both sides and Vite's file changes (196 of 565 export-map packages in obytes).
- **Limits:** workspace React Native packages keep today's limits. Whether React and RNTL are
  explicitly Node-owned is still open.

## Alternatives rejected

- Ownership by alias text or package name: five exhibits still failed that way.
- First evaluator wins: results would depend on test order.
- Vite owns `node_modules`: Vite cannot host React Native's synchronous require, lazy getters
  and cycles.
- Decide the owner after resolution: the two decisions become circular.

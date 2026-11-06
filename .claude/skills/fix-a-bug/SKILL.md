---
name: fix-a-bug
description: Fix a vitest-native bug so it cannot ship again. Use when a bug is reported or found (an issue, a failing app, a review finding): reproduce, add a museum exhibit when the bug is user-shaped, write the failing test, fix, mutation-check, record it.
---

# Fix a bug

1. **Reproduce it on supported versions** (Node, Vitest, React Native, Expo in
   `docs/versioning.md`). A bug only an unsupported version shows gets an upgrade answer,
   not a patch.
2. **Find out whether Vite or Node loaded the file before you trust a result.** A probe that
   imported the file through Vite says nothing about Node's `require` of it. Use a file that is only ever
   required, check `typeof module`, or find the compiled entry in the transform cache.
3. **If the bug is user-shaped** (an app pattern: a setup file, a `__mocks__` folder, a
   library), add a bug-museum exhibit under `packages/vitest-native/validation/bug-museum/`
   that fails as the bug, following that folder's `README.md`. Its `bugSignature` matches the
   bug's own failure line, not a generic crash.
4. **Write the regression test first and watch it fail** for the bug's reason.
   - A test that loops over cases or classifies output counts the evidence it actually
     checked (non-empty trees, matched diffs) and asserts a floor on that count.
   - A swallowed error in a loop (`catch { continue }`) needs a counted reason.
   - A race test forces the interleaving with promises. Never rely on timing.
   - A test that reads a child run's output spawns it with `NO_COLOR=1` and strips ANSI
     codes: CI sets `FORCE_COLOR`, and colour codes break a match that passed locally.
5. **Fix the cause, scoped to what needs it.** A resolver rewrite applies to the package that
   needs it, not every package. When the fix changes the key something is stored or loaded
   under, check every path that still uses the old key.
6. **Mutation-check.** Revert the fix (or reintroduce the defect) and watch every new test go
   red. Run the existing end-to-end fixtures for the area too, not only the new unit test.
   A test that stays green without the fix is not evidence.
7. **Run the gates as the package's scripts, from `packages/vitest-native`:**
   `bun run format:check`, `bun run lint`, `bun run typecheck`, then the suites the change
   touches, one heavy suite at a time.
8. **Record it.** Add the changeset (see `changeset-style`), and link the issue, the test and
   the exhibit from the PR. In the PR, describe the test that was added, never how it was
   checked.

---
name: land-a-stack
description: Merge a pull request or a stack of dependent ones into main without losing work. Use when landing PRs, merging main into a branch, or rebasing a stack after its base was squash-merged.
---

# Land a stack

1. **Squash-merge each PR** once its own CI is green and it has been reviewed. Merge one PR at
   a time; a second merge queue makes every branch fall behind the other.
2. **After a base PR is squash-merged, merge in two steps.** First merge the base PR's final
   branch tip into the next PR, then merge `origin/main`. Merging main alone uses an old
   merge base, and the stack's stale copy of the base wins silently in hunks that do not
   conflict.
3. **Resolve data files from main.** For a conflicted registry or generated file
   (`exhibits.json`, `known-differences.json`, a lockfile), start from main's version and
   re-apply the branch's own entries. Never take one side whole and plan to regenerate: the
   generator reads that file.
4. **Remember rerere.** Recorded resolutions replay on the next merge. Re-check every file
   it resolved.
5. **Audit the result by blob before committing it.** For each file main changed since the
   merge base, flag it if the result equals the branch's pre-merge blob but differs from
   main's:
   ```bash
   base=$(git merge-base HEAD^1 HEAD^2)
   for f in $(git diff --name-only "$base" HEAD^2); do
     [ "$(git rev-parse HEAD:"$f" 2>/dev/null)" = "$(git rev-parse HEAD^1:"$f" 2>/dev/null)" ] &&
     [ "$(git rev-parse HEAD:"$f" 2>/dev/null)" != "$(git rev-parse HEAD^2:"$f" 2>/dev/null)" ] &&
     echo "kept branch side: $f"
   done
   ```
6. **Lint the merge result.** A clean merge can leave the same key twice in an object
   literal; `no-dupe-keys` catches it only if lint runs on the result.
7. **Reinstall before trusting a failure:** `bun install --frozen-lockfile` after merging
   main, because fixtures are copied at install time.
8. **Get an independent merge review.** Someone who did not write the branch reads the
   merge result's diff against main before it is pushed.
9. **Never check main out into a branch worktree.** `git checkout origin/main -- .`
   overwrites every tracked file. Read main with `git show origin/main:<path>`, or work in a
   fresh worktree.
10. **When main turns red after a merge, rerun the last green run of the old commit** before
    blaming the merge. An unpinned upstream or a freshly published package (a registry 404
    on a minutes-old tarball) looks exactly like a bad merge.

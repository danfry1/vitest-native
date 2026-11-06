---
name: changeset-style
description: Write, edit or merge .changeset entries so they read as release notes. Use when adding a changeset to a PR, or reviewing pending changesets before a version PR.
---

# Changeset style

1. **Follow CONTRIBUTING.md, "Writing a changeset".** A bold lead that says the effect and
   who it affects; the exact error in backticks; one action line; at most three bullets; an
   honest "Not covered".
2. **Lint it:** `node packages/vitest-native/scripts/check-changeset.mjs --lint .changeset/<file>.md`.
   An action line starts with "No action needed.", a verb from the linter's list, or
   "To …,".
3. **Write against the last stable release.** A fix to a feature no stable release has
   shipped folds into that feature's entry, or says "a regression in an earlier
   prerelease" in one clause.
4. **Check every claim against the source** before writing it: option names, version floors
   (`src/peer-requirements.ts`, `src/node-range.ts`), which engine a behaviour applies to,
   and whether something fails or only warns.
5. **When merging entries, keep the conditions.** "Only when …", "where the preset
   applies", "flagged for review": a merged entry that drops them overstates the change.
6. **Credit the person** whose issue or pull request led to the change, as the last line:
   `Thanks @handle for reporting this (#12).` Public handles only; never name a private
   source.
7. **Before a version PR, read every pending entry as one set.** Merge entries that describe
   one feature, and make sure each breaking change states its upgrade step.

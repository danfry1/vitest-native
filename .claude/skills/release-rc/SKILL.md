---
name: release-rc
description: Cut a vitest-native release candidate (or a release). Use when preparing a version PR, tagging, or checking that a release is live on npm.
---

# Release a candidate

1. **Review the pending changesets first** (see `changeset-style`) and land the edits.
2. **Open the version PR from a fresh branch on main.** Run `bun install --frozen-lockfile`,
   then `bunx changeset version` with the version set to `<version>-rc.<n>`. Keep the notes
   under one `## <version>` heading; an rc can add a second one, so check.
3. **Add the thank-you paragraph** from `scripts/release-thanks.mjs` (CONTRIBUTING.md,
   "Thanking contributors"). Read the list before pasting it.
4. **Merge the version PR when its CI is green.** Title it `chore(release): <version>`.
5. **Tag only a verified commit on main.** Confirm the merge commit is on main and its
   `package.json` version matches the tag:
   ```bash
   git fetch origin
   git merge-base --is-ancestor <sha> origin/main && git show <sha>:packages/vitest-native/package.json | grep '"version"'
   ```
6. **The maintainer pushes the tag and approves the staged version with 2FA.** The workflow
   only stages it; nothing is installable until that approval (`npm stage approve <id>`).
7. **Confirm it is live:** `npm view vitest-native dist-tags`. A prerelease goes to `next`;
   `latest` must not move.
8. **Record the tag's commit and the published integrity** for the team. Changesets merged
   after the tag go to the next candidate.

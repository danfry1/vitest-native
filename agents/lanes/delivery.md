# Lane: delivery

CI, scripts, dependencies, the build, changesets and releasing. This lane owns the hotspot files `package.json` and `bun.lock`. **Never run it alongside another dependency change.**

**Where to look:**
- `.github/workflows/`: `ci.yml`, `scorecard.yml`, `bug-museum.yml`, `config-axis-matrix.yml`, `release.yml`
- `scripts/` (`check-changeset.mjs`, `verbatim-runtime.mjs`) and `/.github/scripts/classify-change.mjs`
- `package.json`, `tsdown.config.ts`, `package-budget.json`

## Invariants
- **At most 2 runtime dependencies** (`flow-remove-types`, `magic-string`). (ADR 0017)
- **Every `test:*`, `validate:*` and `check:*` script is wired into a workflow,** or allowlisted with a delete date. (ADR 0002)
- **Nothing is ever fetched at run time.** (ADR 0017)

## Settled decisions
- **Required check names never change.**
- **No new third-party Actions.**
- **The publish job holds the only token,** and installs from the lockfile only, with `--ignore-scripts`.
- **A 7-day release-age floor applies everywhere,** with syncpack keeping fixture ranges aligned.
- **Tags come only from `main`,** so the next minor waits for the patch tag. A freeze admits only tests, CI and docs.
- **Behaviour changes ship as a minor,** with a changeset that starts with "Breaking:".
- **Credit external contributors** with a final changeset line: `Thanks @handle for … (#N).` Never name private reporters.

## Conventions
- **Never use `bunx` or `npx` where the repo runs commands** (`tests/no-bunx-npx.test.ts` enforces this). Build with `bun run build`. It runs `bun --bun tsdown`, then copies the static types and writes the build stamp.
- **Pin npm through the setup action,** never with `npm install -g` in a workflow.
- **For a scratch install:** `--minimum-release-age=604800 --ignore-scripts` with a frozen lockfile, pinned to the repo lockfile's versions. A scratch directory outside the repo doesn't read `bunfig.toml`.
- **Changesets must pass `check-changeset --lint`.** It reads the committed head, so run it after `git commit`. Changes to `package.json` fields, `tsdown.config.ts`, `copy-static-types` or production dependencies all need a changeset.
- **Build-file lists live in one place,** `scripts/verbatim-runtime.mjs`, shared by tsdown and the size check.
- **`classify-change.mjs` maps every path,** and fails closed on paths it doesn't know.

## Traps
- **Stacked PRs get no CI and don't retarget.** Run `gh pr edit --base main`, then push an empty commit. Rerunning a job reuses the old SHA.
- **After a squash merge:** merge main, take main's side, and check that the diff equals only your own commits.
- **Nested `file:` fixtures break the frozen install on Windows.** Build them at test time.
- **Each push to `main` cancels the run before it.** Only the latest head gets a verdict, so a release waits for one run with every job finished and nothing skipped by an earlier failure.
- **A failed-job rerun tests the original merge commit.** After a fix lands on `main`, update the branch instead of rerunning.
- **Don't bulk-update branches.** One push starts about 32 of the account's roughly 40 concurrent jobs.

## Not ours (rerun once, then report)
- CDN 404s right after a publish.
- Cold-Babel 5 s timeouts, and slow Windows runners.

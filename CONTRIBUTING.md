# Contributing to vitest-native

Thanks for your interest in contributing!

## Getting Started

```bash
# Clone the repo
git clone https://github.com/danfry1/vitest-native.git
cd vitest-native

# Install dependencies
bun install

# Build
bun run build

# Run tests
bun run test
```

## Development Workflow

1. Create a branch from `main`
2. Make your changes in `packages/vitest-native/`
3. Run `bun run lint` and `bun run format` before committing
4. Add a changeset: `bunx changeset` (see [Writing a changeset](#writing-a-changeset)). CI
   requires one when the change ships: anything under `packages/vitest-native/src/`, the build
   files, or a consumer-facing `package.json` field (`exports`, `engines`, `bin`, `files`,
   `dependencies`, peers and the like). A production dependency bump, a Dependabot one included,
   takes a patch changeset naming the bump. An internal refactor takes `bunx changeset --empty`.
5. Open a pull request

## Practices

Each rule below comes from a bug or a lost CI round. The workflows that repeat are written up
as skills in `.claude/skills/`, which Claude Code loads by name and which read as checklists for
anyone:

| Skill | When |
|---|---|
| `fix-a-bug` | Reproducing and fixing a bug so it cannot ship again |
| `land-a-stack` | Merging a PR or a stack of PRs into main |
| `perf-measurement` | Measuring speed or resource use |
| `docs-claims` | Changing user-facing docs or site copy |
| `changeset-style` | Writing or reviewing changesets |
| `release-rc` | Cutting a release candidate or a release |

**Evidence**
- A test is evidence only if it fails without the fix. Revert the fix and watch each new test
  go red before calling it covered.
- A test that loops over cases counts the cases it actually checked and asserts a floor on
  that count; a test that renders 300 trees can assert nothing about 294 of them.
- Run the gates as the package's scripts from `packages/vitest-native`. Run from the
  repository root, a formatter can match no files and pass.
- Never act on one timing sample (see `perf-measurement`).

**Installs and tools**
- In a new worktree, run `bun install --frozen-lockfile` first. Running `bunx` or `npx` before
  it fetches the latest release of a tool from the registry and runs it.
- After moving fixtures around, check `bun.lock` for temporary `file:` paths before committing.

**Code**
- Compare paths in one spelling. `fs.realpathSync` keeps the spelling a path was given in (a
  Windows short name such as `RUNNER~1`, the case it was typed in); `fs.realpathSync.native`
  returns the long name and the on-disk case. Say in a comment which one a call needs. A
  differently cased root on a case-insensitive disk reproduces the mismatch on macOS.
- Do not reassign members of objects this package does not own (`vi`, `expect`, React
  Native's exports). Add the member to our own object instead, and read state from its owner
  rather than mirroring it in a flag. Where an override cannot be avoided, install it once per
  object and test it under a reused worker and through `vi.resetAllMocks()`.
- Read a child process's stdout and stderr separately, each with its own `StringDecoder` and
  line buffer. A shared buffer, or `chunk.toString()`, splits lines and multi-byte characters.
- Compute state that is fixed for a run once, in the plugin, and pass it to workers. A cache
  created inside per-file setup is rebuilt for every file.

**Files**
- A CommonJS file inside a `"type": "module"` package uses `.cjs`.
- Never commit reporter or coverage output, such as the file `--reporter=json` writes or a
  coverage report. Check `git status` after a debugging run.
- Guard every `rm -rf` in a script: `rm -rf "${dir:?}"`, and refuse a target outside the
  scratch directory.

**Commits and pull requests**
- Use a closing keyword (`fixes`, `closes`, `resolves` and their forms) only for the issue the
  change fixes. GitHub acts on it when the commit reaches main, and a squash-merge copies the
  pull request's text into the commit, so "fix #566" written about another pull request closed
  it. Refer to anything else as "see #566" or "(#566)".

**Long runs**
- Run one heavy suite at a time. To check for another, match the process, not text that your
  own shell also contains: `pgrep -fl 'node .*vitest(\.mjs)? run'`. To queue behind a run,
  wait on its PID.
- Keep the machine awake for long runs. A sleeping laptop stalls a run and looks like a hang.

## Writing a changeset

A changeset becomes the release notes. People skim it to decide whether an upgrade affects them;
agents read it for exact names. Keep it short and write for both.

1. **A bold lead of at most ~25 words.** The effect a user sees, and who it affects (engine,
   option, versions). Someone who reads only this line should know whether it applies to them.
2. **The exact error, in backticks,** when the change fixes one, so a search for it finds the entry.
3. **One action line.** "No action needed.", or the exact option, value or command, and the way
   to opt out if there is one.
4. **At most three detail bullets,** including an honest "Not covered: …" when something is left
   out. Aim for ~80 words in total. Longer explanations belong in the docs, with a link.
5. **Write against the last stable release, never a release candidate.** A fix to something only
   a release candidate broke says so in one short clause ("a regression in an earlier 0.14
   prerelease"), or is folded into the entry for the feature it fixes.
6. **Use the user's vocabulary.** Neutral third person; never mention a person, team, report or
   conversation in the entry itself. The credit line (7) is the one place a person is named.
7. **Credit the people the change came from.** When an issue or a pull request from someone
   other than the maintainer led to the change, end the entry with one line:
   `Thanks @handle for reporting this (#12).`, `… for the fix (#12).` or
   `… for the pull request (#12).` Several people or references read `@a and @b`, `(#12, #14)`.
   Use public GitHub handles only, and never name a reporter who asked to stay anonymous.

| Instead of | Say |
|---|---|
| Node-owned | loaded by Node (a `vi.mock` from a test does not reach its imports) |
| owner, ownership | whether Vite or Node loads the file |
| closure, closure walk | the packages vitest-native compiles |
| registry | React Native's precompiled modules, or just the effect ("React Native loads faster") |

For example, a 176-word entry with four bullets about compiling a workspace library's
dependencies becomes:

```md
---
"vitest-native": patch
---

**Native engine: a package that depends on a workspace library now compiles that library's React Native dependencies, such as `expo-asset`.** Tests that failed with `Cannot find module '…/expo-asset/build/Asset.fx'` now run. No action needed.

- Also applies to a library reached through a string `resolve.alias` or tsconfig `paths` without being declared.
- More installed packages are now loaded by Node, so a `vi.mock` from a test does not reach their imports.
- Not covered: regular-expression aliases and aliases other plugins add. Declare the library as a dependency instead.
```

CI checks each vitest-native changeset a pull request adds or edits
(`packages/vitest-native/scripts/check-changeset.mjs`): a bold lead of at most 30 words, at most
110 words in all (a `code span` counts as one), an action line, no `rc.N`, and none of the terms
above outside backticks. A credit line must be well formed and come last, and it does not count
toward the length or the vocabulary check. Empty changesets are exempt. Run it locally with
`node packages/vitest-native/scripts/check-changeset.mjs --lint .changeset/*.md`.

## Scripts

| Command | Description |
|---|---|
| `bun run build` | Build the package (runs tsdown under bun's runtime — see below) |
| `bun run test` | Run tests |
| `bun run test:example` | Build and test the example app |
| `bun run lint` | Lint with oxlint |
| `bun run format` | Format with oxfmt |
| `bun run format:check` | Check formatting (CI) |
| `bun run typecheck` | Type-check with tsc |

### Why the build runs tsdown under bun

`build` invokes `bunx --bun tsdown` rather than `tsdown`. tsdown's bin declares a Node
shebang, and from 0.22 it calls `Promise.withResolvers`, which Node did not ship until
21 — so building on Node 20 fails with `TypeError: Promise.withResolvers is not a
function`. Bun's runtime has it.

What toolchain the build itself runs under is a separate question from what Node a
consumer needs: the supported range is `engines.node` (Node 22.22.3+, 24.12+ or 26+), whose
Node 22 floor the CI matrix runs at, with RNTL 13 as the lower-bound back-compat leg.

The output is identical either way — verified by hashing `dist` from both runtimes on
tsdown 0.21 and 0.22.

## Releasing

Releases are tag-based. Pushing a `v*` tag triggers the release workflow, which **stages** the version
on npm with [OIDC trusted publishing](https://docs.npmjs.com/generating-provenance-statements) (no
tokens). A staged version is not installable until a maintainer approves it with 2FA.

### Steps

```bash
# 1. Every pull request that changes shipped code carries a changeset (CI checks this).
bunx changeset

# 2. On a release branch, version the package: bumps package.json, writes CHANGELOG.md.
bunx changeset version
#    Add the "Thank you" paragraph at the end of the version's CHANGELOG section (see below).
#    Open it as "chore(release): <version>" and merge it once CI is green (main is protected).

# 3. Tag the merge commit on main and push the tag.
git tag -a v<version> -m v<version> <merge-commit>
git push origin v<version>

# 4. Approve the staged version with 2FA once the workflow finishes.
npm stage approve <id>   # or approve it on npmjs.com
```

The release workflow refuses a tag that `main` cannot reach or that does not match the package
version. It then runs the full gate, stages the package with provenance, and creates a GitHub
Release. The release body is the version's CHANGELOG section, followed by the generated list of
merged pull requests.

### Thanking contributors

Every release thanks the people outside the maintainer whose issue was fixed (closed as completed)
or whose pull request was merged in it. Print the paragraph and paste it into the version's CHANGELOG section and its
release-notes page:

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/release-thanks.mjs --release <milestone>
GITHUB_TOKEN=$(gh auth token) node scripts/release-thanks.mjs --since v<previous-version>
```

`--release` reads the GitHub milestone, so it misses an issue whose fix was milestoned but which
was not; `--since` takes everything closed after a tag or date, which covers a whole release cycle. Bots and the maintainer are left out. Read the list before
pasting it, and remove anyone who asked not to be named.

### Prereleases

To publish a release candidate, set the version to `<version>-rc.<n>` in the release PR, and keep
the notes under the `## <version>` CHANGELOG heading. A version with a prerelease part is published
to the `next` dist-tag (`npm i -D vitest-native@next`) and marked as a prerelease on GitHub.
`latest` is untouched until the final `<version>` is tagged. npm 11 refuses a prerelease without an
explicit dist-tag, so the workflow always passes one (`scripts/release-channel.mjs`).

### Provenance

Every published version includes [SLSA provenance](https://slsa.dev/), cryptographically linking the npm package to its source commit and CI build. No npm tokens are stored as secrets — authentication uses GitHub's OIDC token exchanged with the npm registry.

## Adding a Preset

Presets live in `packages/vitest-native/src/presets/`. Each preset exports a function that returns a `Preset` object with module factories and export lists. See existing presets for the pattern.

After adding a preset:
1. Export it from `src/presets/index.ts`
2. Add auto-detect mapping in `src/preset-map.ts`
3. Add tests in `tests/presets.test.ts`

## Adding a Mock

Component mocks go in `src/mocks/components/`, API mocks in `src/mocks/apis/`. Register new mocks in the corresponding `index.ts` barrel file and in `src/mocks/registry.ts`.

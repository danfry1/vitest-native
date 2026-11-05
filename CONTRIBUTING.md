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
consumer needs: the supported range is `engines.node` (Node 22.13+ or 24.3+), whose
Node 22 floor the CI matrix runs at, with RNTL 12 and 13 as the lower-bound back-compat
legs.

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

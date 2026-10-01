# Contributing to vitest-native

Thanks for your interest in contributing!

## Getting Started

```bash
# Clone the repo
git clone https://github.com/danfry1/vitest-native.git
cd vitest-react-native

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
4. Add a changeset: `npx changeset`
5. Open a pull request

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

The Node 20 CI legs exist to prove the package's *runtime* floor and to pin RNTL 12 and
13 as the lower-bound back-compat corners. What toolchain the build itself runs under is
a separate question from what Node a consumer needs, so the floor stays where it is.

The output is identical either way — verified by hashing `dist` from both runtimes on
tsdown 0.21 and 0.22.

## Releasing

Releases are tag-based. Pushing a `v*` tag triggers the release workflow, which **stages** the version
on npm with [OIDC trusted publishing](https://docs.npmjs.com/generating-provenance-statements) (no
tokens). A staged version is not installable until a maintainer approves it with 2FA.

### Steps

```bash
# 1. Every pull request that changes shipped code carries a changeset (CI checks this).
npx changeset

# 2. On a release branch, version the package: bumps package.json, writes CHANGELOG.md.
bunx changeset version
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

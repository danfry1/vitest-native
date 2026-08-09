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

Releases are tag-based. Pushing a `v*` tag triggers the release workflow which publishes to npm with [OIDC trusted publishing](https://docs.npmjs.com/generating-provenance-statements) (no tokens required).

### Steps

```bash
# 1. Add a changeset describing your changes
npx changeset

# 2. Version the package (bumps version in package.json, updates CHANGELOG.md)
npx changeset version

# 3. Commit the version bump
git add .
git commit -m "chore: release v<version>"

# 4. Tag and push
git tag v<version>
git push && git push origin v<version>
```

The release workflow will:
- Build and test the package
- Publish to npm with provenance attestation
- Create a GitHub Release with auto-generated notes

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

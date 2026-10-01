# Release readiness policy

This document defines what `vitest-native` means by release-supported. It is deliberately stricter
than "the repository tests pass": published artifacts are installed into representative consumer
projects, experimental surfaces are labeled, and upstream compatibility is bounded.

It covers what is **tested** before a release ships. [`versioning.md`](./versioning.md) covers what
is **promised** about the surface those tests cover — which exports and options are protected by
semver, which are experimental, and how the peer ranges below are allowed to move.

## Stability labels

| Surface | Status | Release promise |
| --- | --- | --- |
| Mock engine | Release-supported | Documented behavior and exports are gated on every pull request and release. |
| Native engine | Release-supported beta | Real RN behavior, iOS/Android resolution, presets, helpers, assets, matchers, and isolation are blocking gates. Until 1.0 the [versioning contract](./versioning.md) is honoured best-effort, and a breaking change is called out in release notes. |
| Hot runtime | Experimental | Correctness is gated, but it depends on Vitest's experimental custom-pool API and can require adaptation between Vitest releases. |
| Current RN edge | Canary | Tested weekly and in a pinned packed consumer once adopted; an edge failure opens a compatibility issue. |

## Blocking compatibility matrix

- Node 20.19 on Linux, with RNTL 12 and with RNTL 13.
- Node 22.13 on Linux, macOS, and Windows; Node 24 on Linux.
- Patched Vite lines ^6.4.2, ^7.3.2, and ^8.0.5 through packed consumers.
- Vitest 5 (the lockfile release and the newest 5.x) against React Native 0.81–0.87, and the newest
  Vitest 4.x against the oldest and newest of that range.
- React Native 0.81–0.87 in the full native matrix (`.github/workflows/native-rn-matrix.yml`, the
  source the published fidelity range is generated from).
- React Native 0.86 in a pinned packed Android consumer.
- React Native Testing Library 12, 13, and 14.
- Expo 57, a hoisted npm-workspace monorepo, and a pnpm-workspace monorepo.

Required Vite, Vitest, and React peer mismatches fail during configuration. Unsupported future major
versions are rejected rather than allowed to fail later inside private runner internals.

## Blocking release gates

1. Dependency pinning, lint, formatting, and TypeScript checks.
2. Mock suite and React Native conformance tests, and React Native API coverage of the pinned RN.
3. Native iOS and Android suites, on the forks pool and with the navigation preset.
4. Hot-runtime full suite, cross-file isolation suite, and generated 100-file soak.
5. End-to-end memory-triggered worker recycling.
6. Hot runtime against the default engine: file-for-file parity over a generated app-shaped corpus,
   and identical V8 and Istanbul coverage attribution.
7. Vitest semantics under the defaults, on Vitest 5 and the Vitest 4 floor: config and CLI flags,
   projects, watch mode, the jsdom and happy-dom environments, `--typecheck`, `vitest bench` and the
   HTML (UI) reporter run as Vitest documents them, with cross-file isolation.
8. Mock-versus-real-RN behavioral cross-check.
9. Example app.
10. `npm pack` followed by isolated installs of bare RN, Expo, monorepo, and current-RN consumers.
11. Package export and declaration analysis with `@arethetypeswrong/cli`.
12. Staged npm publishing with provenance; the version remains unavailable until maintainer approval.

## How CI enforces this

Two checks are required on `main`: `CI verdict` (`ci.yml`) and `RN matrix verdict`
(`native-rn-matrix.yml`), alongside CodeQL. Each verdict depends on every gate job in its workflow
and fails if any failed or was cancelled, so adding a matrix leg never needs a branch-protection
change.

- **Docs-only pull requests** skip the gates by a job condition (`.github/scripts/classify-change.sh`).
  GitHub reports a job skipped by a condition as successful, but leaves the checks of a workflow
  skipped by a `paths` filter pending, which would block a required check.
- **The single-leg packed gates** (consumers, Vitest semantics per major, the hot-runtime and registry
  gates) run as parallel cells of one `Packed gate` job. They used to run in sequence on the Linux
  Node 22 leg, which made that leg the critical path: 9.1 minutes against under 4 for every other
  leg. Standard runners are free for public repositories and no job waited in a queue, so the extra
  jobs cost nothing.
- **Pushes to `main` run everything**, even though branch protection requires a pull request to be up
  to date first. A pull request's caches are scoped to its merge ref and only its re-runs can restore
  them; the caches every pull request starts from are the ones `main` saves. `pages.yml` also
  publishes the fidelity matrix from the latest successful `main` run of the RN matrix.

The ATTW gate ignores legacy Node 10 resolution because the package requires Node 20.19+.

Seven of the eleven `exports` subpaths are ESM-only by design — `.`, `./setup`, `./presets`, the
three `jest-compat` runtime shims, and the types-only `./rntl-matchers`. Each of the runtime ones
depends on Vitest, which throws when it is reached through `require()`, so shipping a transpiled
CommonJS build for them produced files that could not be loaded at all. They now declare a single
ESM target for both conditions: a CommonJS consumer still reaches them, through Node's `require(esm)`
support. That is why `engines` pins Node >= 20.19 rather than >= 20.

The remaining four subpaths ship a real CommonJS build and are checked with `cjs-resolves-to-esm`
enforced, so a dual entry cannot quietly lose its `.cjs`. Which subpaths are intentionally ESM-only
is declared in `scripts/check-exports.mjs` and checked against the manifest in both directions;
deriving that split from the manifest instead was verified not to work, because dropping a `.cjs`
simply moved the entry into the excused bucket.

Resolution is not execution: `tests/package-exports.test.ts` additionally loads every declared
target, and resolves and loads every subpath by specifier under both `require` and `import`.

## Release decision

A release is blocked by any failure in the declared support range. Canary failures do not silently
expand the support range: they produce a tracked compatibility issue and must be resolved before the
new upstream major or RN minor is advertised as supported.

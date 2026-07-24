# Release readiness policy

This document defines what `vitest-native` means by release-supported. It is deliberately stricter
than "the repository tests pass": published artifacts are installed into representative consumer
projects, experimental surfaces are labeled, and upstream compatibility is bounded.

## Stability labels

| Surface | Status | Release promise |
| --- | --- | --- |
| Mock engine | Release-supported | Documented behavior and exports are gated on every pull request and release. |
| Native engine | Release-supported beta | Real RN behavior, iOS/Android resolution, presets, helpers, assets, matchers, and isolation are blocking gates. Pre-1.0 APIs can still change with release notes. |
| Hot runtime | Experimental | Correctness is gated, but it depends on Vitest's experimental custom-pool API and can require adaptation between Vitest releases. |
| Current RN edge | Canary | Tested weekly and in a pinned packed consumer once adopted; an edge failure opens a compatibility issue. |

## Blocking compatibility matrix

- Node 20.19 on Linux.
- Node 22.13 on Linux, macOS, and Windows.
- Patched Vite lines ^6.4.2, ^7.3.2, and ^8.0.5 through packed consumers.
- Vitest 4.x and 5.x: the lockfile release, the newest supported 4.x release, and 5.x
  (against the oldest and newest supported React Native).
- React Native 0.81–0.85 in the full native matrix.
- React Native 0.86 in a pinned packed Android consumer.
- React Native Testing Library 12, 13, and 14.
- Expo 56 and a hoisted npm-workspace monorepo.

Required Vite, Vitest, and React peer mismatches fail during configuration. Unsupported future major
versions are rejected rather than allowed to fail later inside private runner internals.

## Blocking release gates

1. Dependency pinning, lint, formatting, and TypeScript checks.
2. Mock suite and React Native conformance tests.
3. Native iOS and Android suites.
4. Hot-runtime full suite, cross-file isolation suite, and generated 100-file soak.
5. End-to-end memory-triggered worker recycling.
6. Mock-versus-real-RN behavioral cross-check.
7. Example app.
8. `npm pack` followed by isolated installs of bare RN, Expo, monorepo, and current-RN consumers.
9. Package export and declaration analysis with `@arethetypeswrong/cli`.
10. Staged npm publishing with provenance; the version remains unavailable until maintainer approval.

The ATTW gate ignores legacy Node 10 resolution because the package requires Node 20+. It also
allows `cjs-resolves-to-esm` only for the three `jest-compat` runtime shims: those entries depend on
Vitest's ESM runtime and are setup-file or Vite-alias targets. All normal public APIs are gated as
dual ESM/CommonJS exports.

## Release decision

A release is blocked by any failure in the declared support range. Canary failures do not silently
expand the support range: they produce a tracked compatibility issue and must be resolved before the
new upstream major or RN minor is advertised as supported.

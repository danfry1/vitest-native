# vitest-native Production Readiness Design

**Date:** 2026-03-22
**Status:** Superseded (2026-06-05) — predates the dual-engine direction. See the reconciliation
banner in the companion plan (`../plans/2026-03-22-production-readiness.md`) and the current source of
truth, `packages/vitest-native/docs/roadmap-to-confident-real-app-use.md`. Retained for the
still-open Pillar 4/5 packaging tasks (coverage, bundle size, security automation, API audit, 1.0).
**Goal:** Transform vitest-native from a solid pre-1.0 package into a 10/10 production-grade, large-org-trusted testing solution — the credible Vitest answer to `react-native/jest-preset`.

## Context

vitest-native at 0.3.0 has strong fundamentals: 1,097+ test assertions across 21 test files, conformance suites ported from RN's own test suite, clean TypeScript, dual ESM/CJS exports, OIDC trusted publishing, and behavioral mocks (not stubs). The gaps are in the production packaging layer — documentation, policies, runtime guardrails, coverage tracking, and API stability commitments.

The target audience is both individual teams already using Vitest who add RN, and the broader RN ecosystem where the package becomes a recognized, trusted alternative to Jest.

## Approach: Interleaved — Trust and Substance Together

Five pillars executed in dependency order, each delivering a complete, shippable improvement:

1. Trust Foundation
2. Conformance Expansion
3. Documentation
4. CI Hardening
5. API Audit & 1.0 Prep

---

## Pillar 1: Trust Foundation

The "would a security-conscious org even consider this" layer.

### Community Files

- **`SECURITY.md`**: Vulnerability reporting via GitHub Security Advisories. Commit to acknowledging reports within 72 hours and providing a fix timeline within 7 days.
- **`CODE_OF_CONDUCT.md`**: Contributor Covenant v2.1.
- **`.github/PULL_REQUEST_TEMPLATE.md`**: Checklist — tests pass, changeset added, docs updated if applicable.

### Runtime Validation (in plugin init)

- Check `vitest` >= 4 is resolvable. If not: `"vitest-native requires Vitest >= 4.0.0, but found X.x. Please upgrade."`
- Check `vite` >= 5 is resolvable. Same pattern.
- Check `react` >= 18 is installed.
- If `@testing-library/react-native` is detected but < 12, warn (not error) with upgrade guidance.
- Validate `mocks` option values are JSON-serializable at config time with a clear error, not silently at runtime.

### Error Message Improvements

- When preset auto-detection skips a package, log it under `diagnostics: true`: `"[vitest-native] Checked for react-native-reanimated: not found, skipping preset"` (positive-path logging already exists; this adds the negative-path logging)
- If the user passes an unknown option to `reactNative()`, warn: `"Unknown option 'platfrom' — did you mean 'platform'?"` (fuzzy match against known option keys)

---

## Pillar 2: Conformance Expansion

The substance that backs the trust signals.

### Fix Interpolation Gaps (17 skipped tests)

- Implement string output range interpolation: `"0deg"` → `"360deg"`, `"0%"` → `"100%"`, numeric prefix/suffix extraction
- Implement color string interpolation: `"rgba(0,0,0,1)"` → `"rgba(255,255,255,1)"` with per-channel lerp
- Handle `Infinity` in input/output ranges
- Make `interpolate()` return a live derived value that updates when the source `AnimatedValue` changes via `setValue`, not a static snapshot

### Expand RN-Ported Test Coverage

Port additional tests from RN's test suite. For each API, assess whether the existing mock needs behavioral enhancement to pass ported tests, or just needs new test coverage:
- `LayoutAnimation` — mock enhancement needed: lifecycle callbacks (`onAnimationDidEnd`, `onAnimationDidFail`) are currently no-ops
- `AccessibilityInfo` — mock enhancement needed: screen reader state, `announceForAccessibility`, `isScreenReaderEnabled` should be stateful
- `Linking` — tests only: existing mock already supports `canOpenURL`, `getInitialURL`, `openURL`
- `Share` — tests only: existing mock returns proper `{action, activityType}` shape
- `Alert` — mock enhancement needed: button callback invocation should be testable via a `_pressButton(index)` backdoor
- `Vibration` — tests only: existing mock tracks `vibrate`/`cancel` calls
- `BackHandler` — mock enhancement needed: verify listener priority ordering (LIFO) and `exitApp` behavior
- `DeviceEventEmitter` — tests only: existing `NativeEventEmitter` implementation covers this

### Automated RN Release Tracking

- Enhance `compat-check.yml` to test against the 2-3 most recent RN minor versions (not just latest)
- When drift is detected, auto-open an issue with a checklist of missing/changed exports, labeled `compat-check`, including the RN version tested and a diff of the export surface
- Add a README badge showing the latest tested RN version

### Conformance Test Tagging

- Use a naming convention or vitest `describe` block to distinguish "ported from RN" tests from "our own behavioral tests"
- Enable running just the conformance suite: `vitest --reporter=verbose tests/rn-conformance/` to show a parity score

---

## Pillar 3: Documentation

The goal: a team lead can hand these docs to 50 developers and they're self-sufficient.

### `docs/api-reference.md`

Every public export documented:
- `reactNative(options?)` — all options with types, defaults, examples
- `vitest-native/helpers` — each function: `setPlatform`, `setDimensions`, `setColorScheme`, `setInsets`, `mockNativeModule`, `resetAllMocks` with signature, behavior, example
- `vitest-native/serializer` — what it does, snapshot format, customization
- `vitest-native/presets` — the Preset interface, creating custom presets
- Mock API surface — behavioral notes per module, known divergences from real RN documented inline
- Environment compatibility — which Vitest environments are tested (node, jsdom, happy-dom) and any caveats

### `docs/migration-from-jest.md`

- `jest.config.js` → `vitest.config.ts` mapping
- `jest.mock()` → `vi.mock()`, `jest.fn()` → `vi.fn()`
- Timer mocking differences
- Snapshot format differences and update commands
- Common gotchas (global setup, module resolution order)
- Before/after code examples for a real test file

### `docs/preset-authoring.md`

- The `Preset` interface explained with annotated type definition
- How auto-detection works (resolution check in `node_modules`)
- Writing a preset for a custom native module
- Registering via the `presets` option
- Full worked example: mock for a hypothetical `react-native-biometrics` library

### `docs/testing-patterns.md`

Practical recipes:
- Testing navigation flows
- Testing animated components (asserting values, simulating timing)
- Testing platform-specific behavior (`setPlatform` per-test)
- Testing hooks (`useColorScheme`, `useWindowDimensions`)
- Testing components that use native modules
- Mocking a specific native module with `mockNativeModule`

### `docs/architecture.md`

For contributors and evaluators:
- How the Vite plugin intercepts `react-native` imports
- The virtual module strategy and `\0vitest-native:react-native` resolution
- How `globalThis.__vitest_native_mock` bridges plugin process ↔ worker process
- How presets compose and override
- The multi-phase initialization in `setup.ts` (env reading, globals, mock construction, preset application, RNTL wiring, cleanup)

### README Updates

- Add badges: CI status, npm version, latest tested RN version, Codecov, license
- Add "Trusted by" section (placeholder structure)
- Link to each doc from relevant README sections
- Trim the README — make it a landing page that routes to docs, not a monolithic manual

---

## Pillar 4: CI Hardening

Quantitative confidence on every PR.

### Coverage Reporting

- Add `@vitest/coverage-v8`
- Set coverage thresholds as a ratchet: measure current levels, then set thresholds to current minus 2% — thresholds only go up as coverage improves, never down
- Integrate with Codecov — badge on README, PR comments showing delta
- Track mock API coverage separately: percentage of RN public exports with behavioral tests

### Multi-Version Test Matrix

GitHub Actions matrix strategy:
- React: 18, 19
- Vitest: 4, latest
- React Native: current minus 1, current, latest (e.g., 0.83, 0.84, latest at time of writing — update as new versions ship)
- Document which combinations are "supported" vs "best-effort"

### Bundle Size Tracking

- Add `size-limit` — track installed size on every PR
- Fail CI if package grows beyond threshold
- Prevents accidental dependency bloat (matters for CI speed in large orgs)

### Security Automation

- Enable Dependabot for npm and GitHub Actions dependencies
- Add `npm audit` step to CI
- Add OpenSSF Scorecard workflow (`scorecard.yml`) for independently verifiable security rating

### Package Validation

- Keep existing `@arethetypeswrong/cli` check
- Add `publint` to catch packaging errors
- Add smoke test: `npm pack` → install tarball in temp project → import each entrypoint → run a basic test

---

## Pillar 5: API Audit & 1.0 Prep

Only after pillars 1-4 are complete.

### Public API Audit

- Enumerate every export from every entrypoint
- For each: keep, rename, deprecate, or mark internal
- Audit and confirm that implementation details (`buildReactNativeMock`, `getMock`) remain unexposed — both are currently internal, verify no regression
- Verify that `ReactNativeMock`, `Preset`, and `VitestNativeOptions` types remain exported; evaluate whether `PresetModule` should be exported for preset authors
- Confirm the `mocks` option boundary (JSON-only, with `vi.mock()` escape hatch for functions) is the right long-term design

### Deprecation & Migration

- Runtime deprecation warnings for any renames, pointing to new name
- `docs/upgrading-to-1.0.md` covering all changes

### Version Compatibility Matrix

- Publish table: vitest-native version → supported Vitest, Vite, React, RN versions
- Automate from CI matrix results

### Stability Commitment

Define what semver means post-1.0:
- **Covered:** `vitest.config.ts` plugin API, helper imports, preset interface, serializer behavior
- **Not covered:** Internal mock implementation details, undocumented `_prefixed` methods

### The 1.0 Cut

- Ship any renames in a 0.x release with deprecation warnings
- Cut 1.0.0 once deprecation period passes
- Changelog entry explaining what 1.0 means
- GitHub Release with announcement

---

## Success Criteria

The package is "10/10 production-grade" when:

1. A team lead evaluating the package finds: security policy, code of conduct, comprehensive docs, clear migration guide, version compatibility matrix, and coverage badges
2. A developer using the package gets: clear errors on misconfiguration, helpful diagnostics, testing recipes, and preset authoring guidance
3. A maintainer watching the package sees: automated RN compatibility checks, wide conformance coverage, multi-version CI matrix, and bundle size tracking
4. An enterprise procurement review finds: OIDC trusted publishing (no stored secrets), OpenSSF Scorecard, Dependabot enabled, security advisory process
5. The conformance suite covers all APIs listed in RN's official API reference that have JS-observable behavior (excluding purely native-side APIs), and drift is detected within one CI cycle (weekly) of a new RN release
6. The API is audited, stable, and backed by a semver commitment at 1.0.0

## Non-Goals

- Dedicated documentation website (premature at this stage)
- Commercial support tiers
- Automated changelog generation from conventional commits (changesets are sufficient)
- Supporting Vitest < 4 or Vite < 5 (these are intentional minimum versions)
- Replicating 100% of RN's test suite (diminishing returns — focus on high-traffic APIs)
- Supporting custom Vitest environments beyond node/jsdom/happy-dom (document which environments are tested)

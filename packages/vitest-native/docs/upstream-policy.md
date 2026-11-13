# Upstream policy

**Status:** adopted 2026-11-06. It extends [versioning.md](./versioning.md#upstream-support-ranges) and does not change it. Where the two overlap, versioning.md's rules on which release may move a range are the contract.

vitest-native sits on Node, Vite, Vitest, React, React Native, Expo and React Native Testing Library, and each moves on its own schedule. This document covers how the package:
- follows them (bumps);
- says what it supports (ranges and floors);
- responds when one of them has a bug that reaches users.

## 1. Ranges: small, current, one source of truth

**What's supported.** The latest release lines only, as listed in versioning.md's support policy. A project on an older release is asked to update, rather than the engine carrying a second code path for it.

**Where each range is defined.** Each range is written once, in code:

| range | source |
|---|---|
| Vitest, Vite, React, RNTL | `PEER_REQUIREMENTS` in `src/peer-requirements.ts` |
| React Native | `SUPPORTED_REACT_NATIVE` |
| Expo SDK | `SUPPORTED_EXPO_SDKS` |
| Node | `src/node-range.ts` |

**What reads them:** the startup checks (`UNSUPPORTED_PEER`, `UNSUPPORTED_NODE`), `vitest-native doctor` and the published `peerDependencies` (a test pins it to the source). The README's Requirements table and versioning.md's table are written from the same values, and a test fails when they differ (follow-up below).

## 2. Two floors per upstream

Every supported line has a **hard floor**, and may have a **recommended floor**.

| | Hard floor | Recommended floor |
|---|---|---|
| Meaning | The engine can't run correctly below it. | A release below it has an upstream bug that reaches vitest-native users; it still works. |
| Below it | Startup refuses (`UNSUPPORTED_PEER` or `UNSUPPORTED_NODE`); doctor reports it. | One warning at startup and a doctor entry. Both name the upstream issue and the release that fixes it. |
| Where | The range's `minimum`. | An entry in `RECOMMENDED_FLOORS` beside it: version, upstream issue, one-line effect. |

**When an upstream fixes a bug in a later release of a supported line:**
- **Moves the recommended floor** to that release, in any release.
- **Moves the hard floor only if** the bug breaks correctness (wrong results, lost tests, a hang) for a large share of users, or it's a security fix (the existing Vite 8.0.5 floor). Then only in a minor, as versioning.md allows for an update within a supported line.
- **Never in a patch.** A hard floor doesn't move in a patch.

**Applied to Vitest 5.1.0 (#611):**
- **What it fixes:** vitest-dev/vitest#11682, where a startup error in Vitest 5.0.5 with Vite 8.3.5 is replaced by "No test files found" and a formatter crash. The error is hidden, but test results aren't wrong.
- **The floor:** 5.1.0 becomes the recommended floor for Vitest 5, and the hard floor stays 5.0.0.
- **The pin:** the repository's own Vitest pin is 5.1.0, moved once its 7-day release age had passed (see §4).

## 3. Upstream bugs: the ladder

When an upstream bug reaches vitest-native users, take these steps in order. Stop at the first that applies.

1. **Report it upstream, or fix it there.** Link the upstream issue from ours. Check first whether it's already reported or fixed (#611 was: fixed in Vitest 5.1.0).
2. **If the fix has shipped,** apply §2: a recommended floor, and a hard floor only on §2's terms.
3. **If the fix hasn't shipped and users are hurt,** a contained workaround in vitest-native, on four conditions:
   - **Feature-detected,** never version-detected. It tests for the broken behaviour, not for a version string.
   - **Public API only.** No monkey-patching of upstream code (lint rule `vitest-native/no-monkey-patching`).
   - **Registered** in `docs/upstream-workarounds.md`, with the upstream issue, the affected versions, the file and function, and two tests:
     - a **need test** that fails without the workaround;
     - an **expiry test** that fails once the supported range's floor includes the upstream fix. Its failure is the signal to delete the workaround.
   - **Small.** One place, behind one function, so deleting it is one change.
4. **If it doesn't hurt users enough for a workaround,** it's documented in troubleshooting, linked to the upstream issue, with the version that fixes it.

## 4. Cadence: how bumps happen

**Dependabot** (already configured): weekly, a 7-day cooldown for every update type, and groups by dependency type (React kept together). The cooldown mirrors the install-time `minimumReleaseAge` gate in `bunfig.toml`.

**CI tests each upstream on three axes:**

| axis | what it runs | today | proposed |
|---|---|---|---|
| **locked** | The repository's exact pins (the lockfile). Every pull request. | yes | unchanged |
| **latest-supported** | The newest release inside each supported range. | Vitest only (`.github/rn-matrix.json`) | also Vite, RNTL and Expo |
| **canary** | Upstream's next or beta channels: Vitest's next major or beta, React Native's release candidate, Expo's next SDK beta, Node's next line. A scheduled job. | partly: the weekly compat-check builds against `react-native@latest` and checks the Expo module table | extends compat-check |

**More on the canary:**
- **Purpose:** a new major can be supported on its release day, because the breakage is known in advance.
- **On failure:** it files a tracking issue, using the existing `actions/github-script` step, with no new actions.
- **Age gate:** canaries install unaged releases inside their own job only (`--minimum-release-age=0`, as compat-check already does). They never change the lockfile.

## 5. New majors and dropping old ones
Unchanged from versioning.md:
- **A new major is supported in a minor,** once the full gate passes on it. The canary is what makes that possible on day one.
- **The previous major is dropped only in a breaking release.** An upstream line already end-of-life is dropped in a minor, as versioning.md allows.

## 6. Ownership and review
- **CI owner** (the support matrix, the latest-supported axis and the canaries): keeps them green, and turns canary failures into issues with an owner.
- **Monthly upstream review,** recorded as an issue:
  - releases adopted;
  - floors moved, with the upstream issue for each;
  - workarounds whose expiry test now fails, which get deleted;
  - canary results, and new upstream majors due.

## Follow-ups this implies (CI and code)
1. **Recommended floors** (done, #611): `RECOMMENDED_FLOORS` in `peer-requirements.ts`, with one startup warning per run and a doctor entry. Its first entry is Vitest 5.1.0.
2. **Upstream workarounds** (#614): `docs/upstream-workarounds.md`, and the need and expiry test pattern.
3. **Generated tables** (#615): the README and versioning.md requirement tables generated from (or tested against) the single source.
4. **More latest-supported axes** (#616): add Vite, RNTL and Expo.
5. **Canary job** (#617): extend compat-check to Vitest beta and next, React Native rc, Expo's next SDK beta and Node's next line, with issues filed on failure.
6. **Monthly upstream review** (#618): an issue template for it.

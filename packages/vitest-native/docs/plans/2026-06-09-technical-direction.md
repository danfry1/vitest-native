# Technical direction (2026-06-09)

Where vitest-native goes from here, decided after auditing everything built through
2026-06-08 (dual engine, cross-check, jest-compat, bake-offs, leak harness). This is the
reference for prioritization; the detailed design for the top bet lives in
[2026-06-09-hot-worker-runtime-design.md](./2026-06-09-hot-worker-runtime-design.md).

## Audit: the four assets, valued honestly

1. **Native engine (~2k LOC) — the crown jewel.** Real RN JS under Vitest, mocking only
   the native boundary. Proven on react-native-paper (32/32), obytes (39/40),
   Rocket.Chat (0→75), RN 0.81–0.84 in CI. Nobody else shipped this; both prior
   Vitest-RN attempts chose full-mock and stalled. This is what makes the project a
   category, not a utility.
2. **Cross-check differential — the trust machine.** CI-gated behavioral diff of mock vs
   real RN (43 probes × RN 0.81–0.84). Found ~8 real mock bugs including a silent
   `userEvent.press` false-pass. Structurally unique to a dual-engine tool: the mock is
   supervised by real RN as a living oracle. Keep growing the corpus; it does not need
   further productization to do its job.
3. **Mock engine (~6.2k LOC) — useful, no longer the product.** Fast, zero-dep,
   deterministic, CI-pinned to real RN behavior. Its identity settles as the fast lane
   for logic/hook/reducer tests.
4. **jest-compat — a door, not a room.** `jestMockTransform` + aliases removed the real
   migration blockers. Freeze at current capability; expanding it chases the weakest
   positioning (turnkey migration of heavy jest suites).

The honest gap: the safe native config (`isolate: true`) runs at roughly jest speed
(bench/leak forced the flip from the unsafe-but-fast `isolate: false` default). So
today's pitch is "jest fidelity inside Vitest, plus a fast mock lane" — good for the
Vitest-standardizing crowd, not yet irresistible.

## What Vitest people actually adopt for

One runner everywhere; instant feedback loops; no Babel/config archaeology. The roadmap
exists to maximize exactly those three, in priority order.

### P0 — Hot worker runtime (surgical per-file reset). The moat.

One persistent worker per core; RN's module graph loads once and stays resident;
every file still gets full isolation because the reset is re-pointed, not removed.
This is the one thing jest structurally cannot do (per-file module registries are
foundational to jest). If it lands, "real RN fidelity, faster than jest, and safe" is
true — which flips the adoption verdict for existing apps, not just greenfield.
Design doc: [2026-06-09-hot-worker-runtime-design.md](./2026-06-09-hot-worker-runtime-design.md).
Acceptance gate: `bench/leak` 10/10 with ONE hot worker (scaled to 50 files), full
native suite + cross-check + bake-off suites green, measured speedup vs jest.

### P1 — Make `engine: 'auto'` real via Vitest Projects.

Vitest projects (workspace) is the natural home for the dual engine: one config, one
`vitest` invocation, one coverage report — a `mock` project for logic tests, a `native`
project for component/RNTL tests, the user's web projects alongside. Ship a
`reactNativeProjects({ ... })` helper that emits both projects with sensible glob
defaults. This turns "unification" from a slogan into a config shape and settles the
engine-identity question crisply.

### P2 — Harvest the free Vitest wins; verify each under the native engine.

Each is cheap and each is a demo jest can't match: watch mode with module-graph-precise
reruns (verify invalidation works through the native engine's require-hook side graph —
`runBaseTests` already honors `ctx.invalidates`); Vitest UI; v8 coverage (verify source
maps through the Babel/Flow transforms); sharding + `--merge-reports`; `expect-type`;
bench mode. Also a docs page for browser mode + react-native-web ("test your RN-web
target in a real browser, same config file").

### Track, don't bet: Vite Environment API

A first-class `react-native` Vite environment (Metro-style resolution as a proper
environment instead of plugin hooks) is the principled long-term home for the native
engine and would dissolve the dual-graph awkwardness. Vitest's environment-API support
is still settling; revisit in ~a quarter, don't rebase the architecture now.

## Explicitly deprioritized

- **jest-compat expansion** — frozen; it's an on-ramp and it works.
- **Inheriting Meta's jest mocks** — demoted from the earlier plan. Cross-check now
  provides the fidelity guarantee this was meant to buy, without a dependency on RN's
  internal mock files across versions. Do opportunistically when a cross-check failure
  points at a Meta mock that is simply better.
- **More migration bake-offs** — the friction taxonomy is extracted. The next bake-off
  waits for the hot runtime, when it becomes a benchmark headline.

## Build principles ("would the Vitest team adopt this?")

- Consume only public Vitest API surface (`vitest/worker`, `vitest/node` exports), even
  where marked `@experimental`. Never patch Vitest internals.
- Reuse Vitest's own machinery (its per-file reset, its transports, its module runner)
  rather than reimplementing in parallel; our code should read as a thin, principled
  extension a Vitest maintainer could review.
- Pin a minimum Vitest version; run a CI canary against `vitest@latest` to catch
  experimental-API churn early.
- When the hot-runtime pattern is proven, write it up and open the upstream
  conversation — "reusable workers with per-file module isolation" (e.g. a first-class
  `isolate: 'modules'` mode) is plausibly something Vitest itself wants.
- Positioning stays honest (see README + positioning notes): claims flip only when the
  benchmark protocol measures them.

## The narrative this builds toward

Today: "Test React Native in Vitest — fast mock lane or real-RN fidelity, one plugin."
After P0+P1: **"Real React Native tests, faster than jest, in the runner you already
use everywhere."** Native becomes the center of gravity; mock is the deliberately
scoped fast lane whose fidelity is CI-pinned; the hot runtime is the claim no jest
setup can follow.

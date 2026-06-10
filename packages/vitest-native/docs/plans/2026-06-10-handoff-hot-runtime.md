# Handoff: hot worker runtime — M0–M3 done, M4 next (2026-06-10)

Start here when picking this work up. Companion docs:

- **Strategy / priorities**: [2026-06-09-technical-direction.md](./2026-06-09-technical-direction.md)
  (P0 hot runtime → P1 Projects-based `engine:'auto'` → P2 free Vitest wins; what's
  deprioritized and why; build principles).
- **Design + milestone log**: [2026-06-09-hot-worker-runtime-design.md](./2026-06-09-hot-worker-runtime-design.md)
  (verified Vitest mechanics F1–F6, the keystone, architecture, and ✅-annotated
  results for M0–M3 — read the milestone section for everything learned so far).

## Where things stand

`engine: 'native'` + `hotRuntime: true | { recycleAfterFiles?, memoryLimit? }` runs
tests in persistent workers where RN loads once per worker, with per-file isolation
preserved. M0 (scaffold) → M1 (surgical reset manifest) → M2 (real-suite parity:
obytes 40/40; Rocket.Chat 574/47 = exact stock parity at 2.5×, on vitest 4.1.8) →
M3 (robustness: recycling, coverage parity, watch, crash, rejections) are **done and
verified**. All gates green as of 2026-06-10:

| Gate | Result |
|---|---|
| `bench` leak corpus, hot, 1 worker | 20/20 @ 5 files; 200/200 @ 50 files (`node leak/gen.mjs 50`) |
| tests-native stock + hot | 84/84 both (`tests-native/vitest.config.mts` / `vitest.hot.config.mts`) |
| mock suite | 1230 pass (`bun run test`) |
| cross-check | 43/43 (`bun run crosscheck`) |
| obytes (`/tmp/bakeoff/obytes`) | 40/40 hot; coverage identical stock vs hot (80 files) |
| Rocket.Chat (`/tmp/bakeoff/rocketchat`) | 574/47 hot = exact stock parity (json diff: 0 regressed) |

## Working-tree state (IMPORTANT)

**Everything since M0 is UNCOMMITTED on `design/dual-engine`.** New/modified:

- `src/native/pool.ts` (new), `worker.mjs` (new), `reset.mjs` (new), `runner.mjs` (new)
- `src/native/apply.ts`, `hooks.mjs`, `loader.mjs`, `setup.mjs` (modified)
- `src/plugin.ts`, `src/types.ts`, `src/validate.ts`, `tsdown.config.ts` (modified)
- `tests/native-unit.test.ts` (async config + 3 new tests), `tests-native/vitest.hot.config.mts` (new)
- `bench/vitest.leak-hot.mts` (new), `bench/leak/gen.mjs` (4 probe classes)
- `docs/plans/*` (these docs), `package.json` (+@vitest/coverage-v8 devDep)
- Also: preset default-export fix in `plugin.ts` load() + `loader.mjs` (a STOCK bug
  found by the obytes rerun — commit-worthy separately from the hot runtime)

Suggested commit split: (1) preset default-export fix + its unit-test update,
(2) hot runtime M0–M3 + docs, (3) bench/leak generator + configs.

Gotchas for the next session:

- `bench/leak/*.test.tsx` committed versions are the OLD 2-probe format. After any
  `git checkout leak/`, regenerate with `node bench/leak/gen.mjs 5` (20 tests).
- Bake-off installs at `/tmp/bakeoff/{obytes,rocketchat}` get the plugin via a copied
  `dist/` (`rm -rf .../node_modules/vitest-native/dist && cp -R dist ...`). Any
  `pnpm add` there re-resolves the stale tgz and WIPES the copied dist — re-copy after.
  `/tmp/bakeoff/react-native-paper/node_modules/vitest-native` is a SYMLINK INTO THIS
  REPO — never `rm -rf` through it.
- Both bake-off configs currently have `hotRuntime: true` set.
- Debugging workers: use `process.stderr.write`, not console (interception suppresses
  passing-file output); vitest file order is unstable run-to-run, so pairwise repros
  mislead — use fixed batches and instrument the deployed dist copies directly.

## Next: M4 — benchmark protocol (gates any claim change)

Generated component-test suites (not the micro leak corpus) at 5/50/200 files ×
1/8 workers, cold + warm, measuring: total wall, marginal per-file cost, peak RSS.
Contenders: jest (bench has `jest.config.cjs` + RN 0.84 installed), native stock
(isolate:true), native hot, mock engine. Build it under `bench/` (suggest
`bench/scale/gen.mjs` emitting RNTL component tests). Only after these numbers:
update README/positioning (see the honest-positioning rule: lead with measured
claims only) and consider flipping `hotRuntime` default.

## Then: M5 — upstream RFC to Vitest

Write up the pattern ("reusable workers with per-file module isolation", proposed as
first-class `isolate: 'modules'`). Collected RFC items:
1. Custom pools can't receive `task.memoryLimit` (getMemoryLimit hardcoded to vm pools).
2. Shared runners are stopped when the queue empties → watch reruns can't keep
   workers hot across iterations.
3. The keystone itself (worker-side isolate flip) deserves a supported API.

## After P0: P1 and P2 from the direction doc

P1 = `reactNativeProjects()` helper (Vitest projects: mock lane + native lane + web in
one run). P2 = verify/document free Vitest wins (UI, sharding/--merge-reports,
expect-type, bench mode, browser-mode+RNW docs page).

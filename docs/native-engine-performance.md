# Native Engine — Performance Architecture & Decisions

> **Purpose:** the durable record of *why* the native engine is configured the way it is and
> *where* the time goes, so future optimization work doesn't re-derive it, re-break it, or
> chase dead ends. Pair with `docs/engine-comparison-evidence.md` (the measured numbers) and
> `bench/` (the reproducible harness).
>
> **Headline (shipped on `design/dual-engine`):** the native engine is faster than jest by
> default — cold ~1.8×, warm ~1.16× at 60 files widening to ~1.31× at 100 — at equal
> fidelity, and with full per-file isolation. Numbers are machine-dependent (measured on
> 10-core Apple Silicon, Node 24); re-run `bench/` on a CI baseline before publishing.

## 1. Where the time goes (the performance model)

Per `vitest run` of the native engine, cost breaks into:
1. **Fixed startup** (~1s): vite server + vitest + worker spawn. Amortized across the whole
   run; dominates *small* suites (why a 75-test suite is ~1.3s for everyone, jest included).
2. **Transform** (Flow-strip RN via `@react-native/babel-preset`): disk-cached
   (path+mtime+size+presetVersion). Cold pays it once per RN file (~241 files); warm is a
   file read. **Not** the bottleneck once cached.
3. **RN module-graph execution**: evaluating React Native's JS. **This is the swing factor.**
   - Under `isolate: true` it happens **per test file** → grows linearly with file count.
   - Under `isolate: false` RN loads **once per worker** (Node's require cache) → ~flat.
4. **Per-file setup**: globals + `module.register` loader + `_extensions` hook. Under
   `isolate: true` this re-runs per file (expensive — `module.register` especially); under
   `isolate: false` it runs once per worker.
5. **Render cost** (react-test-renderer building fiber trees): shared with jest; not a
   differentiator.

The jest-vs-native difference is entirely in (3)+(4): jest re-requires the registry per
file (linear), native with `isolate:false` reuses it (flat). That's the structural moat.

## 2. The decisive lever: `isolate: false` + `pool: threads`

Shipped default for the native engine (`src/native/apply.ts`):
```ts
test: { isolate: false, pool: "threads", /* ... */ }
resolve: { dedupe: ["react", "react-test-renderer", "react-is"], /* ... */ }
```
- **`isolate: false`** — reuse the worker runtime across files. RN's graph loads once.
  Measured scaling (warm): jest 1.37 → 1.67 → 1.99s (25/60/100 files); native 1.30 → 1.40 →
  1.52s. jest grows; native stays ~flat.
- **`pool: threads`** — measurably faster worker reuse than vitest's default pool here
  (~1.52s → ~1.40s at 60 files). Threads share memory; fine for pure-JS RN tests.
- **`resolve.dedupe`** — without it, a fresh consumer project can resolve duplicate React
  copies → null hooks dispatcher (`Cannot read properties of null (reading 'use...')`),
  e.g. on components using `useImperativeHandle`. Required, not optional.

**Is `isolate: false` safe?** Yes, *measured* — not assumed. Deliberate pollution probes
(`bench/`, since removed) showed that under `isolate:false`+`threads` in this setup, **neither
module state NOR `globalThis` leaks across files** — each test file gets a fresh vite-node
module evaluation while the expensive externalized RN stays warm in Node's cache. So **no
per-file state-reset machinery is needed** for the native engine. (This contradicted an
early assumption that we'd need reset logic — we verified instead.)

## 3. Why the mock engine stays `isolate: true`

The mock engine's hand-written RN reimplementation keeps **module-level mutable state**
(e.g. `Dimensions._reset`, stateful helpers). Under `isolate: false` that state pollutes
across files — **verified: 5 test failures** when forced. So mock keeps default isolation
and is therefore slower at scale (~3s @60 files). Accepted trade-off: the mock engine's
value is **determinism + no native deps**, not scale-speed. The native engine is the
scale-speed engine. Do **not** flip mock to `isolate:false` without first making its mock
state per-file-resettable.

## 4. Bug fixed: disk-cache write race

`src/native/transform.mjs` previously did `fs.writeFileSync(cachePath, code)`. On a **cold**
cache, multiple worker threads transforming the same RN file concurrently could let a reader
see a **partial file** → intermittent cold parse failures (this is what looked like
"isolate:false flakiness" before — it wasn't state pollution). Fixed with an **atomic write**:
write to `cachePath.<pid>.<seq>.tmp` then `fs.renameSync` (atomic on POSIX same-dir). Any
future cache work must preserve atomicity.

## 5. Dead ends / what NOT to try (saves future effort)

- **Do not optimize default isolation (`isolate:true`) to beat jest.** It's structurally
  linear (per-file RN reload) and was ~2.4× *slower* than jest; no amount of caching fixes
  re-execution. The win is `isolate:false`, full stop.
- **Do not mock `LogBoxData`/`LogBox` wholesale to silence the act() warning** — it breaks
  Modal + RNTL host-detection (real consumers; partial source-string mock isn't possible).
  The act() warning is cosmetic; the correct fix is a runtime `LogBox.ignoreAllLogs()` in
  setup, not a module mock.
- **Do not assume `isolate:false` is unsafe** — it's measured-safe here. If you change pool
  type or vitest version, re-run the pollution probes before trusting it.

## 6. Remaining headroom (ranked, future work — not yet done)

1. **Pre-shipped transform cache** — ship the ~241 RN-file transforms with the package (or
   build on postinstall) so **cold** runs skip babel entirely. Biggest cold-start win.
2. **Trim fixed vite/vitest startup** (~1s) — dominates small suites. Limited control; track
   vitest improvements.
3. **Reduce loader/hook per-import overhead** — the ESM loader (`module.register`) runs in a
   separate thread; for the externalized-RN path, audit resolve/load IPC cost. Lower priority
   now that `isolate:false` makes RN load once.
4. **Render cost** is shared with jest — only movable by the renderer (RNTL v14 /
   `universal-test-renderer`); not a near-term lever.

## 7. How to benchmark (reproducible)

```
cd bench && bun install
node gen.mjs 100          # generate N identical RTR-based test files
node run.mjs 3            # jest vs native vs mock; cold + warm median
```
`bench/` is a standalone single-package project (one RN copy → jest's mocks work; bun
workspace duplication breaks jest). Caveats baked into the harness: jest needs jest@29 (30
breaks RN 0.84 preset), `@babel/runtime`, and a `.bun`-aware `transformIgnorePatterns`.
Always compare on the same machine/moment; publish methodology with any numbers.

## 8. Where the knobs live

- Native engine config (isolate/pool/dedupe/external/conditions/extensions): `src/native/apply.ts`
- Transform + disk cache (atomic write): `src/native/transform.mjs`
- Native boundary mocks: `src/native/boundary.mjs`
- Loader (import path) / require hook (`_extensions`): `src/native/loader.mjs`, `src/native/hooks.mjs`
- Mock engine config (dedupe, setup injection): `src/plugin.ts` (`config()` mock branch)

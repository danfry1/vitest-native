# M4 — scale benchmark results (2026-06-10)

The gate for any speed claim (per the honest-positioning rule: lead with measured
numbers only). Protocol and harness live in `bench/scale/`; raw artifact is
`bench/scale/results.json`. Reproduce with `node scale/run.mjs` from `bench/`.

## Protocol

- **Suite**: `bench/scale/gen.mjs N` emits N identical-shape RNTL component tests
  (`render` a stateful component, `fireEvent.press`, a `FlatList`, a `StyleSheet`
  assertion — 3 tests/file). The SAME files run under all four contenders.
- **Contenders**: jest (RN preset), native stock (`isolate:true`, today's default),
  native hot (`hotRuntime:true`), mock engine.
- **Sweep**: 5 / 50 / 200 files × 1 / 8 workers. Cold (caches cleared) + 2 warm runs;
  warm = median. Peak RSS = max sampled across the whole process subtree (fair to
  jest's child-process workers and vitest's in-process thread workers alike).
- **Machine**: Apple M5, 10 cores, node v24.13.0, vitest 4.0.18, RN 0.84.1, jest 29.7.

`ms/file` is the least-squares slope of warm wall-time vs file count across the three
points — the **marginal cost of one more test file**, which is the number that
actually separates these engines (fixed startup washes out at scale).

## Results

### 1 worker

| Engine | 5f | 50f | 200f | ms/file | peak RSS @200f |
|---|--:|--:|--:|--:|--:|
| jest (RN preset) | 781 | 2563 | 7906 | 36.3 | 853MB |
| native stock (isolate:true) | 1459 | 13892 | 46048 | 225.1 | 506MB |
| **native hot** | **593** | **1017** | **1697** | **5.4** | 591MB |
| mock | 872 | 10570 | 26294 | 123.9 | 326MB |

Speedup vs jest @200f warm: native hot **4.66×**; native stock 0.17×; mock 0.30×.

### 8 workers

| Engine | 5f | 50f | 200f | ms/file | peak RSS @200f |
|---|--:|--:|--:|--:|--:|
| jest (RN preset) | 1052 | 2787 | 4217 | 14.5 | 4581MB |
| native stock (isolate:true) | 624 | 5171 | 16007 | 77.2 | 2972MB |
| **native hot** | **814** | **1192** | **1395** | **2.6** | 2679MB |
| mock | 478 | 2623 | 8588 | 41.1 | 1015MB |

Speedup vs jest @200f warm: native hot **3.02×**; native stock 0.26×; mock 0.49×.

## What the numbers say (and what they don't)

1. **The hot runtime is the only vitest-native config that beats jest at scale**, and
   it wins decisively: **3.0× (8w) to 4.7× (1w)** at 200 files. The mechanism shows
   up cleanly in `ms/file`: hot adds **2.6–5.4 ms per file** vs jest's **14.5–36 ms**.
   RN loads once per worker and stays resident, so each additional file is nearly
   free — exactly the property the design set out to prove, now measured end-to-end
   on a realistic component suite (not the micro leak corpus).

2. **`isolate:true` is the tax, not RN.** Native stock is the *slowest* contender
   (225 ms/file at 1w) because Vitest spawns a fresh worker — and thus reloads RN —
   per file. This is the status quo the hot runtime fixes; the 40× gap between native
   stock and native hot at 1 worker (46s → 1.7s) is the whole point of the project.

3. **The mock engine is slower than jest at scale (124 ms/file, 1w)** — an honest,
   slightly counterintuitive result. The mock has no real RN graph, but it still runs
   under `isolate:true` (fresh worker per file), so it pays the same per-file
   worker-boot + module-runner cost that sinks native stock. Mock wins only on small
   suites / cold start (lowest 5f and lowest RSS). **Takeaway: do not position the
   mock engine as "the fast one."** Its value is fidelity-of-choice and zero-RN
   startup, not throughput. (Open follow-up: the hot runtime could apply to the mock
   engine too; not yet built.)

4. **Hot's advantage scales with suite size, not down.** At 5 files / 8 workers hot
   is *slower* than at 1 worker (814 vs 593 ms): with files ≈ workers you pay N
   concurrent RN boots and reuse nothing. The win materializes when files ≫ workers
   (200f/8w = 1395 ms, barely above 200f/1w). Claim accordingly: hot is for real
   suites, and parallelism helps it only once each worker amortizes its boot over
   many files.

5. **RSS is competitive-to-better.** Hot uses less peak memory than jest at 8 workers
   (2.7GB vs 4.6GB) because jest forks 8 full RN processes while hot keeps threads;
   at 1 worker hot (591MB) is within noise of jest (853MB) and far below native stock
   in aggregate churn. Memory is bounded further by worker recycling
   (`hotRuntime:{ recycleAfterFiles, memoryLimit }`), which was OFF for this run.

## Sanctioned claims (measured, M4-gated)

- "Real React Native under Vitest, **3–4.7× faster than jest** on a 200-file
  component suite, because RN loads once per worker instead of once per file."
- "**~3–5 ms marginal cost per additional test file** vs jest's 15–36 ms."
- "The only configuration here that beats jest at scale is `hotRuntime:true`; the
  mock engine and the safe `isolate:true` default do **not** — speed is not the
  reason to pick them."

These supersede any pre-M4 speed language. Next: M5 upstream write-up; consider
flipping the `hotRuntime` default (the gates and these numbers now support it, but
the default flip is a separate decision — keep the escape hatch either way).

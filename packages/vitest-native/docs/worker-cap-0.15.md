# The hot runtime's worker cap, measured (0.15)

**Status:** measured 2026-11-06.

**Question:** the hot runtime picks its worker count automatically. It admits one worker per 256 MiB of available memory, up to a maximum of four (`hot-default-design.md`). Would more workers be faster on real suites, and at what memory cost?

**Answer:** no. On both suites large enough to tell, the automatic choice was the fastest row. More workers only added memory and CPU. The maximum of four stays.

## Method

**What was compared:** the same suite with the hot runtime at different worker counts, and per-file isolation at two counts. Each suite was run three times per row, after two warm-up runs, with the order reversed in round 2.

**Rows:**
- hot runtime with the automatic count (`auto`);
- hot runtime with `--maxWorkers` 4, 6 and 8, cores−1 (9) and half the cores (5);
- per-file isolation with the default count and with 4.

**What was recorded per run:**
- wall time;
- user+sys CPU;
- peak memory, summed across Vitest's processes and sampled every 200 ms;
- passed/failed counts, which matched in every row of every app.

**Where:**

| suite | where | build | files |
|---|---|---|---|
| Bluesky (bluesky-social/social-app) | Linux container: Node 24.22.2, 10 CPUs, 12 GB | main 67fa099a | 105 |
| rneui | Linux container | 0.14.1 | small |
| Paper (react-native-paper's suite, run 26 times as one corpus) | macOS host: Apple M5, 10 cores, 24 GiB, Node 24.18.0 | 0.14.1 | the suite ×26 |
| obytes | macOS host | 0.14.1 | 5 |

Numbers from the container and from the host aren't comparable with each other: different OS, Node and installs. Each is only compared within its own block.

## Results (medians of three runs)

**Bluesky, container (main 67fa099a, 1274 tests passing in every row):**

| row | wall | peak memory |
|---|---|---|
| hot, auto (4) | **8.5 s** | **2.3 GB** |
| hot, 6 | 9.7 s | 3.0 GB |
| hot, 8 | 10.3 s | 3.8 GB |
| hot, 9 (cores−1) | 14.1 s | 3.8 GB |
| hot, 5 (half) | 11.8 s | 2.6 GB |
| per-file, default | 17.0 s | 2.4 GB |
| per-file, 4 | 21.8 s | 1.4 GB |

**Paper, host (0.14.1, 4056 tests passing in every row):**

| row | wall | peak memory | CPU |
|---|---|---|---|
| hot, auto | **3.1 s** | 1.5 GB | 13 s |
| hot, 4 | 3.5 s | 1.3 GB | 14 s |
| hot, 6 | 3.2 s | 1.6 GB | 16 s |
| hot, 8 | 3.7 s | 1.9 GB | 19 s |
| hot, 9 (cores−1) | 4.6 s | 2.0 GB | 21 s |
| hot, 5 (half) | 4.4 s | 1.6 GB | 16 s |
| per-file, default | 19.5 s | 0.8 GB | 117 s |
| per-file, 4 | 27.5 s | 1.2 GB | 115 s |

**rneui and obytes:** every row is within run-to-run noise: about 2 s for rneui and 1.6–1.7 s for obytes. With a handful of test files there's almost no per-file startup to save and too little work to spread. They can't separate the rows, in either direction.

## What this shows
- **More workers aren't faster.** At 9 workers on 10 cores, Bluesky was 65% slower than the automatic count and used 63% more memory. Paper at 8 workers was 19% slower, with 29% more memory and 47% more CPU.
  - Each hot worker keeps a full module graph resident, so extra workers mostly compete for the same cores and memory.
- **Worker reuse is the large effect.** The hot runtime was 2× (Bluesky) to 6× (Paper) faster than per-file isolation at any count, because each test file no longer starts a fresh worker (`perf-0.15-soak.md`).
- **The build difference doesn't matter here.** Paper and obytes ran on 0.14.1; Bluesky ran on main after the `vi.resetAllMocks()` fix. That fix changes no worker-count behaviour. 0.14.1 couldn't be measured hot on Bluesky, because that suite hit the bug the fix addresses.

## Caveats
- These are single-machine results, on 10 cores. A machine with many more cores and plenty of memory might gain from a higher count. The cap is a maximum, and `maxWorkers` can still raise it explicitly, within the memory plan.
- The container runs kept two small measurement setup files in each app's config. They cost a few percent of each run, the same in every row.

## Reproducing
1. Install the app at its pinned commit, with the build under test.
2. For each row, run the suite three times with `hotRuntime: 'auto'` or `false`, and with the row's `--maxWorkers`.
3. Record each run's wall time, its peak summed memory, and its passed/failed counts. Discard two warm-up runs first.
4. Compare rows only within one machine and build.

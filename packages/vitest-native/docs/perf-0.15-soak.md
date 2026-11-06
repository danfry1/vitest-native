# Performance against Jest on the 0.15 corpus (0.15.0-rc.1)

**Status:** measured 2026-11-06 on `vitest-native@0.15.0-rc.1` (and main `499f8886` for one
comparison). Covers four open-source apps, each run under its own Jest and under vitest-native
in the same container.

**Bottom line:** on warm runs vitest-native is 1.75–1.95× slower than Jest on three of the four
apps, and faster on the fourth. The cause is per-file worker startup, not transforms or caching.
Under the default per-file isolation every test file gets a fresh worker thread, and each one
pays Node's bootstrap, vitest-native's setup and Expo's runtime setup again. Jest keeps its
worker processes, but still gives every test file a fresh module registry and vm context, so
its isolation is what vitest-native's per-file mode matches. With worker reuse
(`hotRuntime: 'auto'`) Rocket.Chat runs in 14.4 s, against 75.6 s isolated and 43.5 s under
Jest. The hot runtime keeps more state between files than Jest does, so that speed comes with
looser isolation.

## Method

- One container image (Node 24, 10 CPUs, 12 GB), network off, one job on the machine at a time.
- Each app: a copy of its installed trial volume, with the tarball's `dist/` and `package.json`
  swapped in. Jest runs first, because Vitest rewrites a Jest-written `.snap` header and Jest
  then rejects it.
- 3 cold and 3 warm runs per runner. The tables give the median wall time.
  - **Cold:** Jest gets a fresh `--cacheDirectory`; Vitest has `node_modules/.cache` and
    `node_modules/.vite` removed.
  - **Warm:** the same command run straight after.
- Vitest runs use the app's config minus two measurement setup files (per-worker resolve-hook
  counters) that the trial volumes carried. One extra warm run with them measures their cost.
- Worker counts were sampled every 100 ms inside the container: node processes, plus threads
  named `WorkerThread`, since Vitest's workers are threads.
- Profiles: one warm run per app under `NODE_OPTIONS=--cpu-prof` (main thread and every
  worker), with self time totalled by source file and by caller chain.

## Results

| App | Tests (Jest / Vitest passed) | Workers (Jest / Vitest) | Jest cold / warm | rc.1 cold / warm | Warm, rc.1 ÷ Jest |
|---|---|---|---|---|---|
| Rocket.Chat | 4374 / 1571 | 2 / 2 (both configs set `maxWorkers: 2`) | 73.7 / 43.5 s | 85.1 / 77.3 s | 1.78 |
| Bluesky | 1280 / 1274 | ~10 / 9 | 15.1 / 4.8 s | 16.2 / 9.35 s | 1.95 |
| Paper | 716 / 432 | ~10 / 9 | 11.9 / 2.5 s | 9.0 / 4.4 s | 1.75 |
| obytes | 40 / 31 | ~9 / ~4 | 6.5 / 2.1 s | 4.2 / 1.56 s | 0.74 |

- Runs repeat closely: within 1% on Rocket.Chat, within about 6% elsewhere.
- Rocket.Chat and Paper run fewer tests under Vitest, because some suites fail to load. Their
  ratios therefore understate the per-test gap.
- **Bluesky cold, rc.1 against main:** main `499f8886` gives 15.8 / 9.2 s, the same as rc.1
  within noise. An earlier single sample of 27.1 s against 20.0 s was noise.
- **The measurement setup files** cost 2.5% (Rocket.Chat), 17% (Bluesky), 5% (Paper) and 6%
  (obytes) of warm time. They don't explain the gap.

## Where the warm time goes

Vitest's own breakdown of a warm run:

- **Rocket.Chat:** setup 89%, import 5%, tests 4%, transform 1%.
- **Bluesky:** import 40%, setup 31%, transform 18%, tests 10%.

The profiles show where that time comes from.

- **A worker thread per test file.**
  - 105 Bluesky files ran in about 110 worker threads, and 476 Rocket.Chat files in about 500.
  - Each thread lives 0.3–2.5 s, and a trivial file still costs about 0.3 s of CPU.
  - Jest's ~10 processes live for the whole run. Inside them each file still gets a fresh
    module registry and vm context, but no new thread or Node bootstrap.
- **Per thread, before any test runs:**
  - Node bootstrap and module compilation (`compileForInternalLoader`, `compileSourceTextModule`,
    `wrapSafe`): about 13 s of CPU on Rocket.Chat.
  - Expo's runtime: `expo/src/winter/runtime.native.ts` reads `TextDecoder`, which loads
    Node's internal fetch implementation in every new thread. 6.5 s on Rocket.Chat.
  - vitest-native's setup:
    - The native ownership policy (`createNativeOwnershipPolicy`) is built twice per file, once
      for the loader hooks and once for the require hooks. Each build resolves every
      Node-transformed package's directory, and the memo it uses lives only for that call.
      13.1 s on Rocket.Chat, 4.5 s on Bluesky.
    - Registry install: 3.7 s on Rocket.Chat.
  - The project's Babel config: a worker that loads project source through Node starts its
    own Babel thread and loads the project's presets and plugins on the first call
    (`projectBabelOptions`). 2.4 s on Bluesky, which loads 657 source files through Node
    (#571); 0.8 s on Rocket.Chat.
- **Per resolve:** the package matcher `buildPkgMatcher` returns tests every path against two
  regular expressions per package, so each check is linear in the number of
  Node-transformed packages. 8.7 s on Rocket.Chat.
- **Not a bottleneck:**
  - The main thread was busy 2.6 s of a 10.4 s Bluesky run, so the module requests workers send
    it don't limit the run.
  - Transform is 1–2% of Rocket.Chat's warm time; `fsModuleCache` is on by default.

## Variants (warm, rc.1)

| Variant | Rocket.Chat | Bluesky |
|---|---|---|
| Default (per-file isolation, threads) | 75.6 s | 8.9 s |
| `hotRuntime: 'auto'` (worker reuse) | **14.4 s** | 6.8 s, then hangs (below) |
| `--pool=forks` | 76.4 s | 9.1 s |
| `experimental.ownershipModel: 'resolution'` | 77.8 s | 7.9–9.8 s (noisy) |
| `NODE_COMPILE_CACHE` | 74.0 s (−3%) | not run |

**Hang under the hot runtime:**
- A reused worker can keep a `jest.spyOn` spy on an arrow function alive into a later file.
  `vi.resetAllMocks()` there then never returns. Bluesky hit it in 3 of 4 hot runs.
- jest-compat's `mockReset` re-installs the spy's resting implementation. That marks the spy
  as changed again inside the set `resetAllMocks()` is iterating, so the loop never ends.
- Fixed in #595.

## Root causes, ranked by expected gain

1. **Per-file worker startup under isolation.**
   - Measured gain of worker reuse: Rocket.Chat −81% (75.6 → 14.4 s, about 3× faster than
     Jest), Bluesky −24% on its one clean run.
   - Routes:
     - Make the hot runtime safe enough to recommend for Jest-migration suites: #595 first,
       then hot runs on all four apps. Hot isolates less than Jest does, so a suite written
       for per-file isolation needs a per-file vs hot comparison before it switches.
     - Or adopt an upstream per-file reset that reuses workers, which would keep Jest's
       isolation.
     - Or make each new worker cheaper, keeping per-file isolation: items 2–5 below.
   - Everything below shrinks with it, because it is paid once per worker instead of once
     per file.
2. **Ownership policy rebuilt twice per file.**
   - Compute the package directories once in the plugin and pass them through the project
     context, so workers only build matchers.
   - Expected: about 8% of Rocket.Chat's warm wall time (13.1 s of CPU over 2 workers), about
     5% of Bluesky's.
3. **Linear package matcher.**
   - One combined pattern, or a lookup by package name taken from the `node_modules` segment,
     plus the directory anchors.
   - Expected: about 5% on Rocket.Chat.
4. **Babel config loaded per worker, for project files Node loads.**
   - Mostly the #571 path, so fixing #571 removes most of it.
   - A Babel thread shared across workers would remove the rest, and also the thread
     oversubscription (up to 24 `WorkerThread`s on 10 CPUs).
   - Expected: up to about 3% on Bluesky.
5. **Expo runtime's per-thread fetch setup.** 6.5 s of CPU on Rocket.Chat. Worker reuse removes
   it; otherwise it is Expo's cost, paid once per thread.
6. **Node compile cache.** 3% on Rocket.Chat, at the cost of one flag. Worth enabling only
   once the larger items are done.

Paper and obytes were not profiled. Paper's warm gap has the same shape as Bluesky's.

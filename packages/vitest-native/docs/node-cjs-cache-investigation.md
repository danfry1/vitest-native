# Node CJS re-export cache-reset investigation

Date: 2026-09-07; updated 2026-09-15. Status: **guarded package fix implemented
and locally gated; compiled Node candidate fixes the defect. The separate
V8/libc++ repair now removes the local-build warning, and the repaired candidate
passes 383 Node conformance tests with four Windows-only skips and no failures**.

The [portable hash investigation](../validation/module-isolation/v8-hash/README.md)
documents the warning reduction, positive/negative C++ controls, existing
upstream V8 fix and full rebuilt-Node counterfactual. It is not a new V8 discovery
or an all-platform conformance claim. The [Node handoff](../validation/module-isolation/NODE-UPSTREAM.md)
includes the regression, current-release reproductions and matched benchmarks.
The [pinned current-main Linux follow-up](../validation/module-isolation/NODE-MAIN.md)
now records 410 loader passes, five explicit skips and zero candidate failures,
plus a packed RN comparison that passes without the workaround only on patched
Node. These are additional, separately scoped results, not replacement totals
for the Node 24 run above.

Current result: the normal hot worker now drains stale CJS resolution lookups.
The packed consumer passes, and omitting that drain restores the failure. The
dependency-free reproduction still demonstrates the defect in unmodified Node.
Historical failing package results below describe the pre-fix baseline.

This was discovered by the [Metro-profile investigation](./metro-profile-investigation.md),
but the minimal reproduction needs no Metro, RN, Vite, Vitest, transforms or loader
hooks. It is a separate limitation of our hot-runtime reset strategy. Passing the
existing hot suites did not cover this export shape.

## Reproduction and observed contract

From `packages/vitest-native`:

```sh
node validation/module-isolation/probe-node-cjs-reset.mjs
node validation/module-isolation/probe-node-cjs-reset-controls.mjs
```

Both scripts create and remove their own temporary fixture directories. They print
observations; exit zero is **not** a claim that all semantic cases passed. The controls
script reports `semanticFailures` and asserts only the unaffected controls.

The minimal fixture is:

```js
// leaf.js
module.exports = "leaf";
// entry.cjs
module.exports = require("./leaf");
```

Import `entry.cjs?generation=1`, delete both fixture entries from `require.cache`,
then import `entry.cjs?generation=2` and repeat. Generation 1 returns `"leaf"`.
Generations 2 and 3 return `{}`. The new entry is `loaded: true`, while its new
leaf remains `loaded: false`, with empty exports. No error is thrown by Node.

All locally tested binaries reproduce this result:

| Node    | Minimal repro             | Twelve-case controls    |
| ------- | ------------------------- | ----------------------- |
| 20.19.4 | second/third import empty | same four failing cases |
| 22.22.3 | second/third import empty | same four failing cases |
| 24.13.0 | second/third import empty | same four failing cases |
| 24.14.1 | second/third import empty | same four failing cases |
| 24.16.0 | second/third import empty | same four failing cases |

These are local macOS runs, not a claim about every patch release, platform or
current Node main. Later source-build and baseline-suite evidence is qualified
in the follow-up below.

## Discriminating controls

The control fixture exports `{ value: 'leaf' }` to observe both default and named
interop. Each case has an independent directory and runs three generations.

| Change                                                      | Default value across generations | Interpretation                                                   |
| ----------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| direct `module.exports = require('./leaf')`                 | correct, empty, empty            | baseline failure                                                 |
| indirect `const leaf = require(...); module.exports = leaf` | correct throughout               | bypasses re-export discovery, but loses the named `value` export |
| `exports.value = require('./leaf').value`                   | correct throughout               | no transitive re-export discovery                                |
| only `require()`, no ESM import                             | correct throughout               | CJS cache deletion alone works here                              |
| `require(entry)` before each ESM import                     | correct throughout               | dependency is evaluated before preparse can insert a placeholder |
| keep the CJS cache                                          | correct throughout               | not per-file isolation; invalid as a fix                         |
| delete entry only, retain leaf                              | correct throughout               | also not per-file dependency isolation                           |
| delete matching `Module._pathCache` entries too             | correct, empty, empty            | this is not the private relative-resolution cache                |
| vary `./leaf` to `././leaf` etc. each generation            | correct throughout               | same file, new request cache key                                 |
| explicit `.cjs` leaf                                        | correct, empty, empty            | not only `.js` detection                                         |
| real circular entry/leaf re-export                          | correct, empty, empty            | failure also reaches actual cycles                               |
| same cycle with require-before-import                       | correct throughout               | narrow mitigation control, not general cycle proof               |

The indirect rewrite is **not** a semantics-preserving general workaround: the
default value survives but `import { value }` would no longer find the statically
discovered name. Eager require changes evaluation timing and needs its own cycle,
mocking, retry, named-export and module-format gates before any integration.

## Mechanism supported by source and controls

Local embedded Node source was read with `process.binding('natives')`; no internal
state was changed for the reproductions. The source anchors are Node's
[`Module._load`](https://github.com/nodejs/node/blob/v24.16.0/lib/internal/modules/cjs/loader.js)
and [CJS translator](https://github.com/nodejs/node/blob/v24.16.0/lib/internal/modules/esm/translators.js).

1. ESM static re-export discovery creates unevaluated CJS cache entries for the
   entry and its leaf, marking them as originating from the ESM loader.
2. A previous generation left a private relative-resolution cache key for the
   parent's directory and `./leaf`. Deleting `require.cache` does not clear it.
3. The fast CJS require path finds the newly inserted leaf through that old key.
   It treats any not-yet-loaded cached module as a circular require and returns
   its current exports.
4. The slower path distinguishes an unvisited ESM-created placeholder from a
   module already being evaluated. The fast path lacks that distinction.

The hypothesis now has a discriminating runtime intervention. The first attempt,
inspector `Debugger.setScriptSource`, was rejected with `ERR_INSPECTOR_COMMAND`
(`Internal error`) on 24.13.0. A second research-only method pauses at `_load` and
replaces that function inside its actual lexical scope, preserving Node's real
private caches and helpers. It changes only the fast-path branch: return loaded
exports; treat genuinely circular entries as circular; otherwise let an unvisited
ESM-created placeholder reach the ordinary load path.

```sh
node validation/module-isolation/probe-node-cjs-fast-path-patch.mjs --closure-patch
```

All twelve controls pass with this intervention on **each of the five binaries
listed above**, including the four previously failing cases. Direct re-export
named values remain available. This is strong evidence for the causal mechanism,
but **not a built or release-ready Node patch**. The debugger manipulation is
never imported by production code and must not become a supported workaround.

### Assertion-based semantic gate

`test-node-cjs-reset.mjs` adds five dependency-free `node:test` cases:

- fresh default/named exports, matching require/import identity and exactly-once evaluation;
- real CJS cycles retaining partial exports;
- rejected leaf cleanup and retry followed by later cache reset;
- concurrent URL variants sharing one CJS instance per generation;
- unused conditional re-exports remaining unevaluated.

```sh
# Expected nonzero on all five unmodified tested binaries: 1 pass, 4 fail.
node --test validation/module-isolation/test-node-cjs-reset.mjs

# Research-only intervention: 5 pass, 0 fail on each of the same five binaries.
VN_CJS_FAST_PATH_RESEARCH=1 node \
  --import ./validation/module-isolation/probe-node-cjs-fast-path-patch.mjs \
  --test validation/module-isolation/test-node-cjs-reset.mjs
```

Removing the intervention restores the four failures. The unused conditional
re-export case passes with and without it: the candidate does not eagerly execute
that fixture's statically discovered dependency. These are narrow contracts, not
full Node loader conformance. Debugger timings are not performance evidence.

## Actual package gate

```sh
bun run build
node validation/module-isolation/run-metro-projects.mjs
node validation/module-isolation/run-metro-projects.mjs --indirect-control
```

The built plugin runs two Vitest projects with opposing JS/TSX source precedence,
two files per project, and imports through both Vite and Node. Each mode runs in
a fresh process. Forward/reverse sequencer settings swap which file fails in hot
mode. A config-off negative control must fail the TSX-first project.

On Node 24.13.0, Vitest 4.1.10 and the same installed RN 0.87.0:

| Variant                            | Stock, both orders | Hot, both orders                  | Config-off negative |
| ---------------------------------- | ------------------ | --------------------------------- | ------------------- |
| direct CJS re-export               | 4/4 each           | 3/4 each; JS project returns `{}` | expected failure    |
| indirect counterfactual            | 4/4 each           | 4/4 each                          | expected failure    |
| direct, research Node intervention | 4/4 each           | 4/4 each                          | expected failure    |

Before the package fix, the direct gate deliberately exited nonzero. Keep the
direct fixture; do not replace it with the passing indirect counterfactual. The
two projects share an RN installation, so this proves profile
behavior, **not** different-RN-version transformer isolation. This is a workspace
execution gate; the separate consumer matrix supplies packed-install coverage.
Single-worker hot explicitly opts into unbounded batching **only in this fixture**.

Additional runs remove Metro ingestion entirely and expect JS in both projects:

| Legacy-profile direct re-export         | Stock, both order settings | Hot, both order settings |
| --------------------------------------- | -------------------------- | ------------------------ |
| one worker, unmodified Node             | 4/4                        | 2/4                      |
| two workers, unmodified Node            | 8/8                        | 4/8                      |
| two workers, research Node intervention | 8/8                        | 8/8                      |

The two-worker hot run uses normal bounded hot settings, **without** the unbounded
opt-in. There are four files per project, allowing workers to be reused. This
rules out both Metro-profile ingestion and the single-worker escape hatch as
necessary conditions. These runs use Node 24.13.0; the five-version matrix above
is the dependency-free Node gate, not five full package-matrix runs.

```sh
node validation/module-isolation/run-metro-projects.mjs --node-fast-path-control
node validation/module-isolation/run-metro-projects.mjs --legacy-control
node validation/module-isolation/run-metro-projects.mjs --two-workers --legacy-control
node validation/module-isolation/run-metro-projects.mjs \
  --two-workers --legacy-control --node-fast-path-control
```

The patch-control option explicitly preloads the research script in child runtimes.
It changes Node, not the package fixture. With the later package compatibility
fix, the ordinary direct gate also passes without this research intervention.

## Architecture and upstream consequences

- Do not promote automatic hot as generally correct based on earlier green suites.
  The guarded compatibility fix addresses this tested defect; worker replacement
  remains the fallback for incompatible loader customization.
- This does not establish that the RN capsule is better: any approach combining
  Node CJS cache deletion with refreshed ESM imports may encounter this contract.
- Vitest's proposed worker reuse plus Vite-module reset primitive does not itself
  fix external Node module caches. Keep the Node and Vitest asks separate.
- A Node report can be self-contained: attach the dependency-free reproduction,
  exact versions, controls and expected/actual values. A candidate PR should make
  the fast path respect the same placeholder/cycle distinction as the slow path,
  then run Node's CJS/ESM cycle and cache tests and performance checks.
- No upstream issue/discussion/PR has been posted. Existing-issue search has not
  established whether this exact failure is already tracked.

## Next gates

### Source build and compatibility experiment, 2026-09-08–14

The official Node 24.16.0 source archive was downloaded and matched its official
SHA-256 checksum: `2ff84a6de70b6165290111b0fc656ded1ad207a799816fe720cc7c31232df30f`.
The candidate fast-path change was applied to source. Configuration with
`./configure --without-npm --without-corepack` and `make -j4` completed successfully.
The build's temporary directory was cleaned up during a multi-day pause, before
the compiled binary's tests could run. **Build success is not test success**;
there is no compiled-patch conformance or timing claim yet.

Before that cleanup, the unmodified installed Node 24.16.0 passed the matching
source tree's 55 selected `parallel/test-require*` / `parallel/test-module*` cases
(including platform skips). This is a **baseline**, not validation of the patch.
Keep future source/binary/evidence artifacts under the workspace's ignored `.tmp`.

The package-side candidate avoids debugger modification and private Node symbols.
It records resolved CJS parent-directory/request/target edges. After the normal
per-file cache deletion, it lets Node discard stale relative-lookup entries via
a synchronous dry run whose resolver returns an already-loaded sentinel. A
synthetic parent avoids modifying real parent/child links; module loading is
temporarily prohibited; every temporary loader change is restored in `finally`.
Per-file edge metadata is released, including aliases to retained targets.

This still depends on **private mutable CJS loader APIs and the fast-path ordering**.
It is a compatibility candidate, not a new public Node API or the preferred
long-term architecture. A custom synchronous resolver that bypasses the sentinel
is explicitly rejected before the real CJS module can execute. Such configurations
need a supported fallback before general promotion.

Retained artifacts:

- `probe-node-cjs-cache-drain.mjs`: candidate implementation, outside published runtime.
- `test-node-cjs-reset.mjs`: set `VN_CJS_DRAIN_RESEARCH=1` to exercise it; all five
  semantic tests pass on the same five Node binaries listed above.
- `test-node-cjs-drain-contract.mjs`: four safety contracts covering non-evaluation,
  real-parent preservation, resolve-only edges, retained identity/metadata release,
  and fail-closed restoration when a synchronous resolver bypasses the sentinel.
- `bench-node-cjs-drain.mjs`: five alternating-order repetitions, 30 generations,
  100/500 leaves. Both baseline and candidate use a correct require-only workload.

Node 24.13.0 microbenchmark medians (not general product claims):

| Leaves per file | Total baseline / drain | Ratio | Baseline / drain reset per file |
| --- | --- | --- | --- |
| 100 | 49.83 / 52.43 ms | 1.052 | 0.009 / 0.060 ms |
| 500 | 234.47 / 244.74 ms | 1.044 | 0.065 / 0.279 ms |

A disposable copy of the built package, with only its `module-reset.mjs` wired to
the candidate, passes on Node 24.13.0:

- Two projects / two workers / both source profiles / both sequencer settings:
  **8/8 per positive run**, with the config-off negative control still failing.
- Legacy profile (Metro ingestion disabled), two workers: **8/8 per positive run**.
- Native hot suite: **49 files, 232 passing tests, one skipped**.
- Hot isolation: **11 files, 13 passing tests**.
- Idiomatic rendering: **14 files, 21 passing tests**.

`run-metro-projects.mjs` now records actual file execution by project/PID/thread,
and requires observed worker reuse for hot success. A fresh-worker fallback cannot
silently turn that gate green. `VN_METRO_PLUGIN_OVERRIDE` selects the disposable
candidate without overwriting the normal built package during prototyping.

### Integrated implementation and packed mutation gate

The guarded drain is now implemented in `src/native/module-reset.mjs` and runs
immediately after the hot worker deletes per-file CJS cache entries. The original
probe entry point re-exports that implementation, so the semantic/safety tests
exercise the real code, not a diverging prototype. Errors use
`HOT_CJS_CACHE_RESET` and recommend `hotRuntime:false`; runtime defaults are unchanged.

The cleanup blocks ordinary CJS module execution and restores temporary loader
changes on failure. This is not a sandbox for arbitrary side effects inside
user-installed loader hooks. The existing direct-CJS consumer fixture now uses a
real re-exported state module; its default/named exports must work in both files.

Validation of the integrated working tree:

- Full unit suite: **92 files, 1787 passing tests, three skipped**. Two unit tests
  launch the dependency-free semantics and safety gates in real Node processes.
- Native hot: **49 files, 232 passing tests, one skipped**.
- Hot isolation: **11 files, 13 passing tests**.
- Direct two-project/two-worker profile gate: **8/8 in each positive run**, observed
  worker reuse, with the config-off negative control failing as expected.
- Five-version semantic/safety matrix: **9/9** on Node 22.22.3, 24.13.0, 24.14.1,
  24.16.0; **8 passed, one skipped** on 20.19.4 (no synchronous `registerHooks`).
- Before integration, the same drain also passed the **135-file / 135-test**
  generated render workload; the unmodified hot control passed that workload too.
  These were correctness runs, not isolated performance measurements.
- Lint, typecheck and package-budget checks passed. At this checkpoint: 87 files,
  313406 packed bytes, 1056634 unpacked bytes; no new runtime dependency/export.

`run-packed-cjs-reset.mjs` installs the tarball into a real npm RN 0.86/RNTL 13
consumer and materializes fixture packages under `node_modules`. The positive hot
run passes **6/6**. The script then removes only `resolutions.drain()` from the
installed artifact: the negative run fails at the CJS re-export contract. The
original installed file is restored in `finally`. Logs and results are retained
under the workspace's ignored `.tmp/packed-cjs-reset-zfYa9C` for this run.

```sh
bun run build
node validation/module-isolation/run-packed-cjs-reset.mjs
```

This closes the reproduced package defect. It does not claim full Windows,
all-Node-version, all-custom-loader or RNTL 12/13/14 matrix coverage for this change,
nor does it validate the compiled upstream patch. Keep those claims separate.

Checkpoint validation, 2026-09-08: the focused Metro/profile/registry/native-unit
selection passes **95/95**; the research semantic gate still passes **5/5** after
formatting; the new research scripts pass lint and `git diff --check` is clean.
At that historical checkpoint, no CJS cache workaround had been added to
production runtime code; the September 14 integration above supersedes it.

## Loader composition follow-up, 2026-09-15

A new discriminating test found a hole in the initial guard: a later
`Module._resolveFilename` wrapper can short-circuit the tracking resolver. The
first imported direct re-export returns the correct value, but **zero edges are
recorded**. Cache deletion followed by drain therefore does nothing, and the
second and third query imports return `{}` on the tested Node 24.13 binary.

`drain()` now checks tracker ownership **before** the empty-map fast path. A
replacement throws `HOT_CJS_CACHE_RESET` and recommends worker isolation. This
is deliberately conservative: even a forwarding wrapper installed later is
rejected; a forwarding wrapper installed before tracking is supported. It is not
a claim that arbitrary hook side effects, transient replacement restored before
the boundary, or every `registerHooks` lifecycle can be detected.

Four durable safety contracts were added: missing-edge resolver replacement,
preinstalled forwarding resolver, reserved sentinel collision, and forwarding
synchronous resolve hooks. Together with the semantic gate, **13/13 pass** on
Node 22.22.3 and 24.13.0/24.14.1/24.16.0; Node 20.19.4 passes **11 with two
synchronous-hook skips**. These are local macOS results against actual source,
not the inspector intervention.

The existing full CI matrix already includes these tests on Windows Node 22.13,
which lacks `registerHooks`. A small Node 24.16.0 contract-only step now follows
that job's floor checks; no duplicate full job or dependency install is needed.
The packed mutation gate also now runs on one Linux leg. These workflow additions
are configured, **not remotely verified**.

The [upstream handoff](../validation/module-isolation/NODE-UPSTREAM.md) now includes
a durable candidate source patch and explicit build/conformance instructions.
Its loader patch dry-run matched the installed Node 24.13 embedded source. At
that checkpoint, compiled Node conformance remained pending; the retained run
below supersedes that status. The hot worker's misleading public-API comment was
also corrected: its Vite module-node reset still uses internals.

Post-guard reruns: full unit suite **1,787 passed / three skipped** across 92 files;
native hot **232 passed / one skipped** across 49 files; hot isolation **13/13**;
two-project/two-worker positives **8/8** in both order settings for stock and hot,
with the config-off negative failing. The packed consumer is again **6/6**, and
removing its installed drain fails the expected CJS state contract; logs are in
`.tmp/packed-cjs-reset-QNqWsw`. Build, lint, formatting, typecheck and package budget
passed. CI YAML parsed locally; that is not a remote CI run.

### Compiled follow-up and next evidence

The September 15 compiled run now supplies the source-level intervention that
was previously missing. The candidate passes **5/5 semantic cases** and **12/12
controls** without the package drain or inspector. A same-compiler unpatched
build still fails the original four cases. Across 386 Node conformance cases,
both local builds have the same result: **381 pass, four Windows-only skips, one
shared failure** involving an evaluated-worker file-descriptor warning. The
official binary passes the remaining case. No new candidate conformance failure
was observed, but this is not an all-green conformance claim.

The packed RN consumer also passes **6/6 with the drain removed** on the compiled
candidate, while the matched unpatched binary fails the state contract. Both
pass with the drain present. This is the direct counterfactual showing that an
upstream fix can eliminate this particular compatibility bridge.

Fourteen samples per binary on Node's cached-require, cold-require and cycle
microbenchmarks produced candidate/baseline throughput ratios **1.0000, 0.9915,
1.0009**. These narrow results show no large local regression; they are not an
RN-suite speed claim or proof of statistical equivalence. Full methods, hashes,
commands, shared failures and results are in the
[compiled upstream handoff](../validation/module-isolation/NODE-UPSTREAM.md#retained-compiled-binary-results-2026-09-15).
Evidence is retained under `.tmp/node-cjs-source.QIfPfL`.

An experimental-control lesson: Node's tests initially inherited the workspace's
ESM package scope. Explicit CommonJS and empty package boundaries also changed
intentional syntax-detection/warning contracts. A clean execution copy outside
any parent `package.json` resolved those baseline artifacts. The collector now
rejects invalid enclosing scopes instead of silently measuring the wrong setup.

The shared warning now has an independent two-translation-unit C++ reproduction:
V8's vendored header changes integral hashing in only one translation unit.
Standard-library-only, class-constrained and specialization-removal controls
pass; the original-header negative fails. This matches an existing upstream V8
fix, not a new V8 discovery. The Node-native loader regression also now passes
on the candidate and fails on the baseline. See the linked handoffs for the
portable sources, source pins and limitations; neither result changes the
original 386-case totals.

The full V8-repaired build pair subsequently closed that local warning gate:
the baseline passes 382 Node cases, skips four Windows-only cases and fails only
the newly added regression; the candidate passes 383 and skips four, with no
failures. Three worker-probe repetitions on each of four binaries show that V8
repair fixes only the warning and loader repair fixes only CJS reset. The new
packed counterfactual again passes 6/6 without the drain only on the candidate.

Official macOS arm64 Node 24.21.0 and 26.8.2 still fail the same four of five
unmodified semantic cases, and the guarded package drain passes all 13 contracts
on both. The fresh repaired-pair benchmarks give candidate/baseline throughput
ratios 1.0076, 1.0083 and 1.0020, with overlapping ranges; these are not established
speedups. See the handoff for source/binary hashes, commands and complete logs.

1. Current-main/Linux paired source gates, focused upstream lint and packed
   counterfactual are now recorded in [NODE-MAIN](../validation/module-isolation/NODE-MAIN.md).
   Windows source gates, broader Node CI and human contribution review remain.
   The targeted existing-report search is not an exhaustive novelty check.
   The [research index](./runtime-research-index.md) tracks relevant open Node
   proposals without implying adoption or runtime validation.
2. Expand the guarded compatibility layer's custom-loader and Windows coverage;
   keep its explicit worker-isolation fallback and packed mutation control.
3. Observe the new Windows hook and packed mutation CI steps; preserve failures
   as evidence instead of interpreting configuration as a passing result.
4. Test threads and forks, supported Node versions, and packed externalized CJS
   packages before calling any mitigation production-ready.

# Runtime architecture decision

**Status:** architecture selected; staged production hardening is gated
**Date:** 2026-08-31
**Scope:** the highest-fidelity React Native test lane that can run in Node, for bare
React Native and Expo projects

## Decision

Keep the existing split/hot runtime as production while moving it toward a smaller,
supported form:

- **Vitest/Vite owns tests, application/first-party source and virtual mock
  facades.** Vitest should reset this graph and its mocks before every file while
  reusing the worker realm.
- **Node owns React Native's CommonJS runtime and the detected Metro-source
  third-party closure assigned to the native Babel loader.** A project-scoped,
  precompiled factory registry preserves RN's synchronous `require()`, lazy getters
  and cycles while Node-owned module caches reset according to package policy.
- **A single ownership service decides every boundary.** Resolution, transformation,
  optimizer exclusions, Node hooks, mock policy, reset policy, diagnostics and the
  doctor consume the same decision and provenance.
- **Package setup restores shared-realm state; the pool bounds total memory and
  recycles at file boundaries.** Module reset alone cannot restore timers, globals,
  listeners or native/runtime singletons.

Do not promote the Vitest-hosted persistent RN capsule. It has not beaten current hot,
it introduces a third ownership layer for React and other externals, and React Native
does not benefit from being converted into ESM semantics.

The target is not “one graph” as a slogan. The target is **one authoritative owner and
one runtime identity for every resolved module within a project**. A deliberate Vite
graph plus a deliberate Node CommonJS graph is robust when their boundary is explicit
and enforced. A single package silently appearing in both is a correctness failure.

```text
                         one project context

  test files ─────┐
  app source ─────┼────► Vite/Vitest graph ───────┐
  virtual facades ┘      reset per test file      │
                                                   │ explicit, typed boundary
                                                   ▼
                               Node CJS/ESM graph + RN registry
                               RN + detected native dependencies
                               reset/persist by ownership policy
                                                   │
                                                   ▼
                                         mocked native boundary

  shared worker realm: restored after each file
  worker process/thread: recycled before its memory budget is exhausted
```

## Architecture freeze

The topology is now sufficiently proven to stop exploring greenfield replacements
and the persistent RN capsule. Proceed by strangling the current implementation
toward this design inside `vitest-native`.

Confidence is deliberately split by claim:

| Claim | Confidence | What would still change it |
| --- | ---: | --- |
| layered, single-owner runtime is the correct target | high (~93%) | a packed workload that requires one package to have interacting Vite and Node identities |
| RN should remain a Node-owned CommonJS registry | very high (~96%) | a Vite-owned representation matching its semantics, speed and memory with fewer owners |
| upstream needs worker reuse plus full module/mock reset | very high (~95%) | a smaller supported Vitest primitive that removes the same private seams |
| current hot is a sound migration base | high (~90%) | an unresolved packed correctness failure in its supported Node assurance lane |
| explicit hot memory controller is production-ready | high (~90%) | more CI/container shapes may recalibrate its conservative constants |
| automatic hot selection is ready to become the default | medium (~75%) | real-app and RN/RNTL/Expo version-matrix mileage remain |

These details are intentionally **not** frozen: the public Vitest option name, Linux
memory reserves, the complete state manifest, optimizer-specific hooks and whether a
second consumer eventually earns a standalone ownership library. None requires a
new package or a different graph boundary today.

## Product boundary

The native engine is the **highest-fidelity Node component and integration lane for
React Native**. It executes real React Native JavaScript and real ecosystem packages
above a deliberate native boundary.

It does not execute the shipped app under Hermes and cannot prove:

- native iOS/Android module implementations;
- Yoga/device layout, rendering, animation or accessibility behavior on a device;
- Hermes-only runtime behavior;
- native build configuration, signing or the final IPA/APK.

Those claims require a device/simulator lane. Category leadership comes from making
the Node lane exceptionally fast, faithful, deterministic and easy to configure—and
from making its assurance boundary impossible to misunderstand.

## Why this decision changed

The earlier bake-off treated a persistent Vitest-owned RN capsule as the likely
destination. Adversarial review identified a simpler hypothesis: current hot only
needs a reused worker plus a full Vite module/mock reset. React Native can remain in
the Node representation that already matches its semantics.

That hypothesis now has direct evidence:

- a source prototype adds `isolate: "modules"` to Vitest;
- the upstream build, lint, root typecheck, CLI, coverage and discriminating tests
  pass;
- a packed RN 0.87 suite runs on a stock Vitest worker without private module-node
  reset code;
- RN 0.81 and RN 0.87 coexist as separate projects in one Vitest invocation;
- a 136-file RNTL-heavy suite passes in 1.808 seconds versus current hot at 1.577
  seconds and full isolation at 18.54 seconds;
- module mode and current hot have essentially the same after-GC growth curve;
- real file-boundary recycling bounds that growth;
- the persistent-capsule path is therefore extra machinery without a demonstrated RN
  advantage.

Full evidence and the retained Vitest patch are in
`validation/module-isolation/README.md`.

## Implementation checkpoint

The first strangler slice is now implemented inside `vitest-native`; this evidence
does **not** justify replacing the package with a greenfield public package:

- `native/ownership.mjs` creates one immutable, project-scoped policy with separate
  owner, transform and reset-lifetime dimensions plus structured evidence;
- native config, externalization, the CommonJS hook, ESM loader, hot resident rules,
  Vite conflict detection, diagnostics and doctor reporting consume that policy;
- worker-boundary manifests are versioned and validated, and explicitly name
  worker-time preset transform augmentation rather than pretending the static list
  is complete;
- an actual Vite transform of a Node-owned file is a hard
  `MODULE_OWNER_CONFLICT`, not a warning or a second best-effort compilation;
- `server.deps.inline: true` and narrow inline patterns that overlap Node ownership
  fail during configuration. The retained singleton negative control proved why:
  both copies compiled, but a value written through Vite read back as `""` through
  Node;
- the policy hands Vitest mutable pattern-array copies while keeping its evidence
  immutable. A native startup gate earned this rule when Vitest's in-place sort
  rejected the initially frozen boundary array.
- ownership strips Vite query/fragment suffixes before classifying an id, and React
  Native's consumer-visible package root is canonicalized through `realpath`. A
  symlinked RN fixture proved that `node_modules` substrings alone would hand the
  real source path back to Vite. The stronger runtime fixture uses an arbitrarily
  named real directory and proves that the registry, CommonJS hook and ESM loader all
  compile its Flow dependency and substitute its native boundary. A separate
  regression prevents `NODE_PATH` from making the consumer borrow this package's own
  RN install.
- explicit hot mode now consumes the validated memory planner in production: it uses
  the effective host/cgroup ceiling, caps automatic concurrency at four, serializes
  replacement overlap, recycles on worker heap or process RSS and fails closed at the
  hard RSS boundary;
- current Vitest's one-worker non-isolated batch is rejected before registry
  compilation unless `allowUnboundedMemory:true` explicitly accepts an externally
  bounded, unrecyclable run.
- hot shared-realm restoration is now a declarative, ordered state manifest. It
  covers Vitest timers/stubs, native-boundary overrides, known RN state, environment,
  process/RN listeners, complete global and console descriptors, ErrorUtils and the
  Expo compatibility runtime. Restore failures name the entry and fail the run;
  mutation validation proves all eleven actions are observable. Import-time listener
  state is blessed only when the shared ownership policy marks its package
  worker-resident; ordinary Node-owned dependencies re-evaluate and are reset.

Phase 1 is a substantial slice, not the final observation ledger. A conflicting Vite
transform and configuration that necessarily defeats externalization fail hard.
Node loading project source still reports a targeted warning because that observation
alone does not prove Vite evaluated the same file. Turning every possible twin into a
hard error requires recording observations from both graphs and a narrow, reported
exception mechanism; do not claim that guarantee before that ledger exists.

Migration remains internal and incremental. The existing registry, native boundary,
Expo/RNTL behavior, packed gates and regression fixtures are product assets, not
refactoring baggage. Extract a generic ownership/state core only after a second
runtime demonstrates the same contracts; do not pay a new-package compatibility
reset in advance.

## Architecture invariants

These are correctness rules, not implementation suggestions.

1. **Exactly one owner per resolved module.** `vite`, `node`, `virtual` or
   `native-boundary`; never an implicit combination.
2. **Project-scoped state only.** Toolchain, RN version, platform, Metro profile,
   registry, transforms and caches are keyed by project context. No first-caller-wins
   process global.
3. **Metro-compatible source selection.** Platform/native/generic variants are tried
   in Metro's extension-major order. Declarative Metro inputs are supported with
   provenance and bounded scope.
4. **Mock reach is explicit.** A Vite mock cannot retroactively change a dependency
   already captured by a Node external. The ownership doctor must explain that
   boundary before it surprises a test.
5. **File boundaries have three layers.** Reset Vite modules/mocks, restore mutable
   realm/runtime state, then consider worker recycling. None substitutes for another.
6. **No silent twins.** If the same package identity is observed in Vite and Node, the
   native run fails with actionable provenance unless an explicit, narrow exception
   declares why the identities cannot interact.
7. **Memory is a total budget.** Worker-local heap thresholds are inputs, not the
   safety claim. The scheduler protects process/cgroup RSS and replacement overlap.
8. **Diagnostics use the same policy as execution.** The doctor must not reimplement
   ownership or resolution with approximate substring rules.
9. **Packed consumers are release gates.** Workspace green is insufficient for
   package exports, peer selection, pnpm layout and loader-hook behavior.
10. **The native boundary is a product contract.** New mocks and adapters declare what
    they simulate and what they cannot prove.

## Component architecture

### 1. Project context

Every Vitest project receives an immutable context created from its real root and
resolved dependencies:

```ts
interface ProjectContext {
  id: string;
  root: string;
  platform: "ios" | "android" | "native";
  reactNative: { root: string; version: string };
  expo: null | { root: string; version: string };
  toolchain: {
    node: string;
    vite: string;
    vitest: string;
    babelPreset: string;
  };
  metroProfile: MetroProfile;
  ownership: OwnershipService;
  registry: RegistryDescriptor;
  stateManifest: StateManifest;
}
```

Construction must be retryable and keyed by all semantic inputs. The transformer has
already replaced its old first-caller-wins globals with canonical-root contexts and a
two-project regression. Extend that pattern to registry, ownership and runtime state.
Compiler artifacts may be shared only by a complete content/toolchain key; that does
not justify sharing mutable request or preset objects.

### 2. Ownership service

All execution paths request one structured decision:

```ts
interface OwnershipDecision {
  projectId: string;
  request: string;
  importer: string | null;
  resolvedFile: string | null;
  owner: "vite" | "node" | "virtual" | "native-boundary";
  format: "esm" | "cjs" | "json" | "asset" | "unknown";
  transform: "native-babel" | "vite" | "registry" | "none";
  reset: "per-file" | "runtime-cache" | "worker" | "persistent";
  mockReach: "vitest" | "node-loader" | "fixed-boundary";
  cjsInterop: "namespace" | "default" | "react-native" | "native";
  reason: OwnershipReason;
  evidence: string[];
}
```

Initial ownership policy:

| Module class | Owner | Reset | Reason |
| --- | --- | --- | --- |
| tests and first-party app source | Vite | per file | mocks and module state vary |
| virtual preset/mock facades | Vite | per file | must observe file-local mocks |
| React Native root/deep implementation | Node registry | runtime cache | preserve CJS semantics |
| detected Metro-source third-party closure | Node loader | runtime cache | avoid Node/Vite twins; compile published native source |
| React singleton used by RN | one declared external owner | worker/runtime policy | identity-sensitive |
| RNTL, renderer and test-runtime packages | stable external/runner owner | persistent or worker policy | identity-sensitive infrastructure |
| native iOS/Android services | boundary virtuals | state manifest | deliberate simulation |

Package location is evidence, not policy. `node_modules` does not imply persistence,
and a filename substring does not imply ownership.

The service exposes an append-only decision trace in debug mode. Production lookups
use normalized ids and indexed package roots, not repeated filesystem walks.

### 3. Vitest module isolation

The preferred upstream API is:

```ts
test: {
  isolate: "modules";
}
```

For Node threads/forks it means worker/realm reuse with `mocker.reset()` and full
evaluated Vite-module reset before every file. Files remain separate scheduler tasks
at one worker so `canReuse()` can enforce memory policy.

This eliminates two fragile production mechanisms:

- the custom worker entry used to lie about `isolate` inside the worker;
- direct mutation of private Vite module nodes to reset their promise/exports state.

It does not eliminate the Node RN loader/registry, Metro resolution, state restore,
Expo adapters, ownership enforcement or memory-aware pool policy.

Until the upstream primitive is released in supported Vitest versions, current hot
remains the production implementation behind version handshakes and mutation-sensitive
gates. The package is not blocked on upstream to ship; upstream determines how much
private Vitest machinery can be deleted.

### 4. React Native CommonJS registry

React Native's source uses synchronous factories, lazy getters and real cycles. A
mechanical ESM conversion changed evaluation order and broke a cycle around
`VirtualizedListCellRenderer`. The registry is therefore the right representation:

- compile RN files once into CommonJS factories;
- construct/reset RN module instances through a controlled CommonJS cache;
- seed public root and discovered deep entries used by supported ecosystem packages;
- key the artifact by RN root/version, platform, Babel/preset inputs, Metro profile
  and sorted entry set;
- expose one RN identity to all allowed Node and Vite boundary adapters.

At 406 RNTL-heavy files, removing the registry took 28.2 seconds and peaked at 2.25
GiB versus roughly 5–7 seconds with the registry. It is operationally foundational,
even though the no-registry control proves it is not supposed to change semantics.

#### Cold compiler process

A first uncached registry build temporarily expands V8's heap in the main Vite
process and leaves a high RSS watermark after GC. Move cache-miss compilation into a
short-lived child:

```text
parent: compute key ─► cache hit ─► mmap/read artifact
          │
          └─ cache miss ─► child compiler (96 MiB old-space initially)
                              │ atomic write
                              └─ exit; all compiler heap reclaimed
```

The child rechecks the cache to tolerate races and reports structured OOM vs compiler
errors. Retry a heap OOM at a larger cap; never silently disable the registry.

### 5. Metro compatibility profile

Metro is the semantic oracle for the source-resolution behavior this lane emulates,
not an unquestioned source for every user configuration value.

The supported profile includes, incrementally:

- extension-major platform/native/generic source order;
- `sourceExts` and `assetExts`;
- supported package main fields and export conditions;
- explicit-file and directory-index behavior;
- platform selection for native ecosystem packages;
- deep React Native entries in the supported version matrix.

Every imported Metro value records whether it came from default RN behavior, user
configuration or a package override. Unsupported imperative resolver behavior fails
with an explanation or uses an explicit adapter; it is not approximated silently.

Scheduled differential fixtures resolve mixed variants through the installed
`metro-resolver` and this package, then compare exact winners. This external oracle
prevents another test from encoding our own incorrect belief as “Metro order.”

### 6. Native transform pipeline

Vite-owned native consumers run through the project's RN Babel preset with a cache
key containing project, platform, toolchain, content and relevant ownership policy.
The pipeline has three explicit adapter classes:

1. Metro-compatible resolution;
2. statically safe CJS/ESM boundary normalization;
3. package-versioned interop repairs backed by a failing fixture.

Native packages remain out of generic dependency prebundling unless the optimizer
uses the same platform-resolution profile. Vite 6/7 esbuild and Vite 8 Rolldown need
the same correctness path; backend-specific hooks may accelerate but never define
semantics.

### 7. State manifest

`isolate: "modules"` deliberately shares a JavaScript realm. Fake timers,
`vi.stubGlobal`, environment changes, process listeners and arbitrary library
singletons can leak even when all Vite modules reset.

Each runtime profile contributes declarative capture/restore entries:

```ts
interface StateManifestEntry {
  id: string;
  restoreOrder?: number;
  capture(): unknown;
  restore(snapshot: unknown): void;
  verify?(snapshot: unknown): void;
}
```

Core entries cover timers, globals, environment, process listeners, RN/Expo global
descriptors, native-module mocks and console/error handlers. Lower `restoreOrder`
values run first; every verifier runs only after every restore action, so interaction
between domains is observable. Current hot restores
at the next file's setup boundary (or discards the realm after the final file),
because that hook is ordered and awaited across supported Vitest versions. The
upstream-backed runtime should prefer a guaranteed `finally` boundary when Vitest
provides one. Failures report the specific entry. Mutation tests remove each restore
action and require the adversarial isolation gate to fail.

The registry and resident fallback are tested separately. The normal registry resets
RN's in-memory factory cache per file, so RN-local Dimensions and listener state are
already fresh; disabling the registry makes those manifest actions observable against
the one resident Node identity. The native boundary remains realm-owned and is
restored in both paths.

This is not a generic promise to sanitize every third-party singleton. Modules with
unknown mutable process state either become worker-reset boundaries or are documented
as user-managed fixtures.

### 8. Memory-aware pool

The measured RNTL-heavy curve grows roughly 0.7–0.8 MiB of after-GC worker heap per
file in both module mode and current hot. Recycling is mandatory.

The production controller needs two levels:

- **worker-local:** Vitest's reported `heapUsed` decides whether that thread can be
  reused after a file;
- **run-global:** process RSS plus cgroup/current usage controls worker admission and
  fail-closed behavior.

Production policy, to be calibrated further in Linux CI:

- effective limit is the minimum valid host and constrained-memory ceiling;
- soft RSS at 80%, hard RSS at 90%;
- reserve main-process and old/new worker overlap;
- automatic worker count no greater than four;
- derive a 96–512 MiB local heap threshold from the remaining per-worker envelope;
- do not start another file when doing so could breach the hard envelope;
- log chosen limit, reserves, worker count, threshold and evidence.

Node thread `heapUsed` is thread-local while `rss` is process-wide. Forks require
cgroup or process-tree aggregation. Node 20 compatibility means newer
`process.availableMemory()` cannot be the only source.

Hot worker admission now happens before cold registry compilation, so an unsafe
one-worker/container plan fails before paying that spike. Registry cache-miss
compilation still happens in the Vite main process today. Moving it into a bounded,
short-lived child remains Phase 3 work; its transient RSS does not overlap the worker
set, but can still consume container headroom during setup.

### 9. Expo capability profile

Bare RN and Expo share the engine. Expo contributes project-scoped capabilities:

- Expo runtime ownership and native-boundary declarations;
- package/main-field inputs to the Metro profile;
- WinterCG/global state-manifest entries;
- Expo Router route discovery and synchronous context support;
- versioned packed-install fixtures.

Expo Router's test ponyfill synchronously requires discovered routes. That was a hard
problem only for the discarded capsule, which tried to move the route graph into
Vitest and therefore searched source for literal `renderRouter("./app")` calls. In a
packed Expo 56 / RN 0.85.3 consumer, the accepted Node-owned path successfully
resolved a route root assembled at runtime and rendered a dynamic route. Keep that
non-literal consumer as a permanent gate; no package-specific source regex or public
synchronous Vitest execute-by-id API is required by the target architecture.

### 10. Doctor and evidence ledger

The doctor prints a stable, machine-readable report per project:

- effective RN/Expo/Vite/Vitest versions and roots;
- platform and Metro profile with provenance;
- module owner/format/transform/reset/mock-reach decisions;
- registry key, cache hit/miss and compiler mode;
- state-manifest entries;
- memory ceiling, reserves, workers and recycle threshold;
- supported assurance boundary;
- twins, unsupported resolver hooks and version-skew errors.

Native runs fail on detected dual ownership. An escape hatch must name the exact
package/id and reason and appears in the report; there is no global “ignore twins.”

For regulated organizations, the report can be retained with test results so a run
records which modules were persistent, reset, virtualized or outside the assurance
scope.

## Performance strategy

Performance work follows the actual cost centers:

1. Reuse normal Vitest workers and reset only the Vite module graph/mocks.
2. Keep RN's compiled factories resident; reset lightweight module instances.
3. Compile registry cache misses outside the long-lived main process.
4. Cache transforms by semantic project/toolchain key.
5. Avoid generic prebundling when it violates Metro selection.
6. Cap automatic concurrency where marginal speedup is smaller than memory cost.
7. Recycle at file boundaries before retained RNTL/runtime state dominates RSS.
8. Benchmark packed, warm and cold paths separately.

Recurring CI starts with discriminating workloads rather than a combinatorial grid:

- RNTL-render/navigation-heavy;
- external CJS/Vite ownership-edge-heavy;
- cold registry build;
- two-project/version coexistence.

Use ratios against the safe baseline and retain raw environment metadata. Numbers are
regression tripwires, not portable marketing claims.

## Upstream strategy

Open a Vitest design discussion first, with a PR-grade patch attached. Lead with the
generic primitive, not React Native and not selective persistence:

```ts
isolate: "modules" // reuse realm; reset Vite modules and mocks per file
```

Initial scope: Node threads and forks. Evidence includes the negative/shared control,
mocks, query ids, pending dynamic imports, realm-state leakage, setup restoration,
two workers, two projects, recycling and coverage.

`preserveActual` belongs only in a possible later increment for runtimes that truly
need a Vite-owned persistent module closure. It is not required by this architecture.

If maintainers prefer another name, preserve these semantics:

- scheduler knows files are module-isolated but realm-shared;
- one-worker files remain separate tasks;
- Vitest owns mock/module reset at the per-file lifecycle seam;
- coverage sees file boundaries correctly;
- pool authors can recycle between files without private module-node access.

Do not post or open a PR until the discussion text and patch are rerun against the
then-current Vitest main branch.

## Delivery sequence

### Phase 0 — foundational P0s (completed; keep as permanent gates)

1. Metro extension order is extension-major and a real `metro-resolver` differential
   oracle covers mixed variants.
2. Product documentation describes the lower native boundary rather than claiming
   parity with the Jest preset's component mocks.
3. Transformer toolchains are keyed by canonical project root, with a two-project
   regression proving the old first-caller-wins failure.
4. Environment detection requires a consumer-visible `react-native` installation as
   well as the Babel toolchain.

### Phase 1 — consolidate the current production path

1. Introduce the ownership decision type and trace.
2. Route resolver, transforms, optimizer exclusions, Node hooks and doctor through it.
3. Turn twin-owner warnings into native-run hard errors with a narrow escape hatch.
4. Preserve current hot behavior behind existing packed/mutation gates.

### Phase 2 — bounded automatic hot

1. Implement constrained-memory detection and total RSS accounting. **Shipped for
   explicit hot mode.**
2. Add the four-worker automatic cap and calibrated worker admission. **Shipped for
   explicit hot mode.**
3. Preserve single-file tasks so one worker can recycle. **Validated in the upstream
   module-isolation prototype; current production fails closed at one worker.**
4. Add state-manifest verification and fail-safe restoration. **Shipped for the
   current hot runtime; broader RN/RNTL/Expo version coverage remains a promotion
   gate.**
5. Make `hotRuntime: "auto"` choose/explain a safe plan; keep explicit overrides.

### Phase 3 — cold-path and Expo hardening

1. Move registry cache-miss compilation into the bounded child process.
2. Add declarative Metro ingestion and scheduled differential fixtures.
3. Keep literal, runtime-computed and in-memory Expo Router contexts in the packed
   consumer matrix.
4. Run RN/RNTL/Expo packed matrices under npm and pnpm layouts.

### Phase 4 — upstream-backed simplification

1. Open the Vitest module-isolation discussion with the retained generic patch.
2. Adapt the patch to maintainer-agreed API and land it upstream if accepted.
3. Consume the released primitive for supported Vitest versions.
4. Delete the custom worker entry and private evaluated-module mutation.
5. Retain only the thin ownership/state/memory/native runtime integration.

### Phase 5 — enterprise release gates

1. Validate V8 and Istanbul coverage on packed RN scale fixtures. **Shipped for
   current hot as an exact default/hot map and execution-count CI gate.**
2. Run container/cgroup memory and forced-OOM recovery gates.
3. Publish assurance-scope and evidence-ledger documentation.
4. Add deterministic sequencing/worker metadata to artifacts.
5. Validate upgrade matrices for each supported RN, Expo, Vite, Vitest and Node range.

## Promotion gates

The upstream-backed runtime becomes the default native engine only when all hold:

1. No supported path mutates private Vitest/Vite module-node state.
2. All supported files remain recyclable at one or more workers.
3. Total RSS stays inside container limits, including old/new worker overlap.
4. Packed RN/platform and RNTL 12/13/14 matrices pass.
5. Packed bare, Expo and Expo Router fixtures pass with npm and pnpm layouts.
6. Two projects with distinct RN/platform/toolchains coexist in one invocation.
7. Metro differential and mixed-extension fixtures pass.
8. Root, deep, mock, `importActual` and native-boundary contracts pass.
9. V8/Istanbul coverage remains attributable and stable under worker reuse.
10. Ownership decisions are project-scoped, explainable and twin-free.
11. Cold registry compilation is bounded and retry-safe.
12. Current hot is matched closely enough on the two historically discriminating
    workloads; any regression has an explicit, justified tradeoff.

Until then, current hot remains the production benchmark and fallback.

## What remains uncertain

- exact Linux cgroup reserves and thresholds across real CI/container shapes;
- whether Vitest maintainers accept `isolate: "modules"` or choose another public
  vocabulary;
- the final public mechanism for stock-pool memory admission/recycling;
- the complete state manifest for every supported Expo/RNTL version;
- optimizer convergence across Vite 6/7 esbuild and Vite 8 Rolldown;
- whether a second non-RN integration eventually justifies extracting the ownership
  and state-manifest core as a standalone library.

None of those unknowns overturns the central decision. The experiments are strong
enough to stop investing in the persistent RN capsule as the destination and to
proceed with the layered, single-owner architecture behind explicit promotion gates.

# Metro profile and graph-resolution investigation

Status: active architecture investigation  
Started: 2026-09-04  
Branch: `feat/native-runtime-architecture`

This is an evidence log, not a product announcement. It records observations,
failed assumptions, discriminating experiments and remaining unknowns so the
work can later support vitest-native, an upstream Vitest/Node proposal, other
Metro-compatible tools, or a standalone graph-ownership/optimization library.

## Product boundary

The native engine aims to be the highest-fidelity **Node** lane for React Native
component and integration tests. It executes React Native's real JavaScript and
mocks the native boundary. It does not execute the shipped app under Hermes and
cannot prove native iOS/Android implementation, Yoga/device layout, binary
packaging or device-only behavior. Those claims belong to a device/simulator
lane.

Within that boundary, resolving a different source file than Metro is a
correctness defect: the test may exercise code the application never ships.

## Corrected assumption: Metro order is extension-major

Metro iterates `sourceExts` in the outer loop. For each extension it tries the
platform variant, `.native`, then generic:

```text
.ios.js, .native.js, .js,
.ios.jsx, .native.jsx, .jsx,
...
```

vitest-native previously used platform-major order and had a unit test whose
comment called that order Metro-compatible. A mixed fixture disproved both the
implementation and its self-authored gate:

```text
Foo.native.js + Foo.ios.tsx
Metro:         Foo.native.js
old resolver:  Foo.ios.tsx
```

The production fix now has a differential oracle against the installed
`metro-resolver`, including 160 mixed layouts. Literal tests prove internal
consistency; a compatibility claim needs an external implementation or
specification as its oracle.

## `sourceExts` is precedence, not an allow-list

Results from the actual installed framework packages in this checkout:

| Profile              | `sourceExts` in exact order                         |
| -------------------- | --------------------------------------------------- |
| React Native / Metro | `js, jsx, json, ts, tsx`                            |
| Expo 56              | `ts, tsx, mjs, js, jsx, json, cjs, scss, sass, css` |

A discriminating real-framework fixture contains both `Feature.js` and
`Feature.tsx`:

| Resolver profile  | Winner        |
| ----------------- | ------------- |
| bare React Native | `Feature.js`  |
| Expo              | `Feature.tsx` |

The former hard-coded bare list therefore makes an Expo test execute a
different file from Expo Metro. Appending missing extensions would not fix it;
the order itself must be project-scoped data.

The resolver cache must include the ordered `sourceExts`. Keying only by
platform and base path returns the first project's answer to another project
with different precedence. A unit fixture now resolves one base under both
orders and requires different winners.

## Actual declarative framework profiles

Pinned implementations inspected and executed locally:

- Metro 0.84 defaults: `sourceExts = [js, jsx, json, ts, tsx]`, generic
  `resolverMainFields = [browser, main]`;
- `@react-native/metro-config` 0.85: adds
  `resolverMainFields = [react-native, browser, main]` and the
  `react-native` condition;
- `@expo/metro-config` 56: TypeScript-first source ordering above, adds `heic`,
  `avif`, and `db` asset support in this installation, and supplies the
  `react-native` condition for iOS/Android through its platform condition table.

Metro's base asset list also contains formats missing from vitest-native's
former convenience list, including `psd`, `xml`, `m4v`, `mpeg`, `mpg`, `aiff`,
`caf`, `html`, `pdf`, `yaml`, `yml`, and `zip`. Conversely vitest-native has
compatibility additions such as `woff`, `woff2`, `tiff`, and `heif`.

Asset and source sets are not independent. A common SVG transformer moves
`svg` from `assetExts` to `sourceExts`; unioning all known asset defaults after
loading Metro config would silently undo that decision. The intended merge is:

1. take Metro's resolved assets without restoring removed default entries;
2. remove configured source extensions from automatic assets;
3. apply the user's explicit `assetExts` additions last.

The first prototype unioned the convenience defaults into Metro's list. Review
rejected that rule: removed assets must remain removed even when not added to
sourceExts.

## Why configuration evaluation runs in a child

Loading Metro configuration executes project JavaScript and imports a large
build-tool graph. In-process measurements in this checkout left roughly:

- 64 MiB total parent RSS after loading React Native's Metro config from a
  roughly 44 MiB baseline;
- 97.5 MiB total parent RSS after loading Expo's Metro config from the same
  approximate baseline.

Those modules are needed only long enough to extract a small JSON profile. They
must not become resident identities in Vite's long-lived main process.

The prototype uses the bounded-child protocol also used for cold RN registry
compilation:

```text
Vite parent
  └─ stdin: project root/platform/config path
      bounded child
        ├─ loads the project's own Expo/RN Metro implementation
        ├─ executes its config
        ├─ extracts declarative data only
        └─ fd 3: versioned JSON profile
      child exits; Metro/toolchain heap is reclaimed
```

The private fd is deliberate: user config and dependencies may write to stdout
or stderr without corrupting the protocol. The parent validates every field.
The child starts at a 128 MiB old-space cap, retries at 256 MiB only for a
recognized V8 heap OOM, and has a 30-second deadline.

Real installed-framework gate, 2026-09-04, Node 24.13.0 on macOS:

| Load                 | Child duration | Child RSS | Parent RSS retained after both loads |
| -------------------- | -------------: | --------: | -----------------------------------: |
| React Native profile |          59 ms |  60.6 MiB |                                      |
| Expo profile         |         187 ms |  91.1 MiB |                  1.5 MiB total delta |

These are local diagnostics, not universal performance claims. The gate uses a
generous parent-retention ceiling; it does not ratchet exact latency or child RSS.

## Framework loading seams

The prototype resolves tooling from the **project**, never from
vitest-native's dependency graph:

- Expo: `expo/metro-config.loadUserConfig({ projectRoot, serverRoot })`, Expo's
  own default-plus-user-config path, including config-less apps.
- bare RN: the project's `@react-native/metro-config` supplies framework
  defaults. Its paired `metro-config.resolveConfig` loads the user file, and
  its `mergeConfig` merges the result.
- older/minimal bare projects without `@react-native/metro-config`: explicit
  fallback constants plus local config evaluation.

Generic `metro-config.loadConfig` is wrong for a config-less Expo project: it
starts from generic Metro defaults, not Expo defaults. Merely searching for
`metro.config.*` is insufficient because Expo applies its defaults with no file.

Config search is currently project-root scoped: Metro's
JS/CJS/MJS/JSON/TS/CTS/MTS names, `.config/metro.*`, and root
`package.json#metro`. Searching upward risks assigning one workspace another
project's policy and needs a separate experiment.

## Policy versus observation

Safe declarative inputs for the first production increment:

- ordered `sourceExts`;
- `assetExts`;
- platform conditions for diagnostics and later ownership policy;
- profile provenance and config path.

`resolverMainFields` is captured but must not be copied blindly into Vite.
vitest-native deliberately gives many ecosystem packages to Node. Metro's
`browser` field can select a web build in Vite while Node selects `main`,
recreating the dual-instance defect the ownership work prevents. Main-field
adoption requires a package-owner-aware experiment.

All owners must receive the same complete source order. The first prototype
filtered non-JS/JSON extensions out of Node's profile. Review rejected this:
given `Feature.svg` and `Feature.js` under an SVG-first profile, it selects
different files in Vite and Node. Resolution must preserve the winner; execution
may then require a transform adapter. Profile ingestion alone does not install
a Metro SVG/CSS/custom transformer.

## Imperative resolver boundary

`resolver.resolveRequest` is a function, not declarative data. Serializing its
existence but approximating its behavior would be a silent fidelity failure.
The proposed default is fail-closed. An explicit escape hatch may apply the
declarative profile while ignoring the custom function, but must warn.

Before stability, real custom configs need classification: alias/package
redirects, virtual modules, monorepo policy, platform overrides, and
transformer-coupled resolution may need different adapters.

## Related runtime architecture findings

Production hot is intentionally split: Vite owns tests/app modules; Node owns
RN's CJS graph and selected ecosystem modules; one ownership policy prevents
duplicate identities; workers are reused while Vite modules and shared-realm
state reset per file.

The Vitest-hosted capsule experiment is not one graph: it has a Vite graph, an
in-capsule CJS factory graph, and Node-loaded external dependencies. It has not
beaten production hot on speed/RSS and is not the target architecture.

The highest-leverage Vitest upstream primitive is worker/realm reuse with
per-file Vite module and mock reset—provisionally `isolate: "modules"`.
Selective `preserveActual` matters later only if RN moves into Vite's graph.
Evidence and negative controls live in `validation/selective-persistence` and
`docs/runtime-architecture-bakeoff.md`.

## Possible standalone work

### Bounded one-shot toolchain execution

The registry compiler and Metro loader now share versioned JSON I/O, a private
fd, stdout isolation, heap caps, OOM-only retry, deadline, output cap and parent
validation. This could help any daemon that needs Babel/Metro/TypeScript config
once but cannot retain its graph. Before extraction: cancellation, Windows fd
behavior, sandboxing arbitrary config, dependency-aware caching, and structured
diagnostics need experiments.

### Project-scoped module ownership/provenance

Resolution, transform, optimizer exclusion, reset, doctor and twin-instance
checks should consume one table. A reusable result could be:

```ts
interface OwnedResolution {
  id: string;
  owner: "vite" | "node" | "native-boundary";
  format: "esm" | "cjs" | "json" | "asset";
  reset: "per-file" | "worker" | "process";
  reason: string;
  evidence: string[];
}
```

This may be more valuable than an RN-only resolver because silent twin instances
affect any hybrid Vite/Node runtime.

### Differential resolver harness

Generating ambiguity-rich layouts and comparing exact winners against a real
resolver caught an error ordinary fixtures missed. This can generalize to
Metro-compatible tools and compatibility CI.

## Experiment ledger

| Experiment                             | Result                                | Gate/location                                       |
| -------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Metro extension interleaving           | old assumption disproved              | `tests/metro-resolver-oracle.test.ts`               |
| project source-order cache key         | different answer required per profile | `tests/native-unit.test.ts`                         |
| fixture RN and Expo defaults           | pass                                  | `tests/metro-profile.test.ts`                       |
| async config + noisy stdout            | pass; private protocol intact         | same                                                |
| malformed config                       | bounded actionable failure            | same                                                |
| custom `resolveRequest`                | detected explicitly                   | same                                                |
| malformed child payload                | rejected by parent                    | same                                                |
| actual installed RN/Expo profiles      | pass                                  | `validation/module-isolation/run-metro-profile.mjs` |
| bare-vs-Expo mixed winner              | `js` vs `tsx`                         | same                                                |
| parent retention after both real loads | 1.5 MiB local delta                   | same                                                |

Reproduce with:

```sh
bunx vitest run tests/registry-process.test.ts tests/metro-profile.test.ts
node --expose-gc validation/module-isolation/run-metro-profile.mjs
```

## Promotion gates still required

### Adversarial follow-up, 2026-09-06–07

The working implementation wires the profile through the plugin, worker setup,
CJS hook, ESM resolver and registry cache key. It remains **opt-in** through
`metroConfig: true` (or an options object). The initial working tree enabled it
by default; that was premature given the open framework/matrix gates and has
been corrected before committing.

New discriminating evidence:

- 130 additional profile-specific resolutions compare exact winners against
  real `metro-resolver`, on both platforms, including a custom SVG-first order.
- A typed `.tsx` winner exposed a registry defect: it resolved correctly but
  embedded raw TypeScript in a CJS factory. The fallback hook compiles it. The
  registry now compiles TS/TSX/JSX too; a subprocess fixture asserts the same
  winner via registry execution, CJS execution and ESM resolution. The registry
  format key was advanced to invalidate older output.
- Concurrent child loads evaluate each project's cwd-dependent, promise-exported
  config. Cwd changes inside the disposable child, never in Vite's parent.
- An ordinary config failure previously triggered another evaluation through
  dynamic import. Only Node's require/ESM format refusals now switch loaders;
  a marker-file fixture proves an ordinary throwing config executes once.
- Parent validation rejects extension strings containing paths or invalid
  suffix characters before they become resolver/cache policy.
- The generic child controller consumes asynchronous stdin errors, including
  EPIPE when helpers exit before draining their input.

The real-framework script obtains actual config data and tests our resolver
against known expected winners. That proves framework data ingestion; the
separate `metro-resolver` comparisons provide the independent resolver oracle.

RSS values above are instantaneous samples after loading, **not peak RSS**.
Child duration excludes startup/IPC. The 1.5 MiB parent delta is a local
observation. These limits matter when sharing the measurements upstream.

Local source inspection found imperative resolution beyond user config: RN's
community CLI adds an out-of-tree-platform resolver; Expo CLI wraps the resolver;
Worklets bundle mode redirects RN and TurboModuleRegistry to shims. Detecting a
function in loaded config does not enumerate later CLI-installed behavior. This
profile therefore does not establish full Expo CLI/Metro equivalence.

The package file ceiling increased from 85 to 88 for the shared child controller,
profile loader and evaluator. Before final documentation the artifact measured
87 files, 310793 packed bytes and 1049345 unpacked bytes, within unchanged byte,
dependency and export ceilings. Investigation logs/fixtures are not published.

### Remaining promotion work

Follow-up execution on 2026-09-07 completed the full packed consumer matrix:
bare RN, Expo, Expo Router, npm/pnpm monorepos, RN 0.86 Android/hot and mock RNTL 14,
plus CLI doctor/init/migrate checks. Expo and Expo Router opted into Metro profiles;
the other consumers retained their existing configuration. This does not establish
profile-on coverage for every consumer. The artifact had 87 files, 311832 packed
bytes and 1052057 unpacked bytes, within the unchanged byte ceilings.

The new two-project execution gate then found a **separate hot-runtime CJS cache
failure**. Stock execution passes in both order settings; hot returns `{}` from a
direct CJS re-export in the second JS-project file. A dependency-free Node repro
fails across Node 20/22/24. Full evidence, controls and upstream implications are in
[Node CJS cache investigation](./node-cjs-cache-investigation.md). The passing
indirect-re-export counterfactual is not a replacement for the failing direct gate.

Update, 2026-09-15: the guarded package drain now passes the original direct
two-project/two-worker gate in both order settings (8/8 each, with worker reuse
observed), and its config-off negative control fails as expected. The packed CJS
consumer also passes with the drain and fails when it is omitted. This closes the
reproduced CJS blocker, not the remaining Metro-profile matrix below.

- Exercise custom source transforms end to end (SVG classification alone is gated).
- Expand profile-on packed consumers beyond the Expo/Router cases already passed.
- Classify real custom resolvers and settle fail/adapter/escape behavior.
- Confirm Windows config formats and private-fd behavior.
- Test Expo/RN version ranges, not only versions installed here.
- Measure mock-suite cold startup and evaluate a safe no-config cache.

Only after these pass should Metro-profile ingestion be called production
behavior. The data strongly supports the architecture; it does not eliminate
the remaining matrix.

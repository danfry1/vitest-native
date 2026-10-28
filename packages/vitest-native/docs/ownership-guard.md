# Ownership guard: one evaluation per file

Status: detection on by default since this release, reporting as a warning. `error` is
opt-in and is what this repository's CI runs. The default becomes `error` in the next
minor (see [Rollout](#rollout)).

## The invariant

Under `engine: 'native'` one worker runs two module systems. Node's CommonJS loader and
ESM loader hold React Native and the packages compiled for it (`src/native/hooks.mjs`,
`loader.mjs`, the precompiled registry in `registry.mjs`). Vite's module runner holds the
test files and project source. A file that **both** evaluate exists twice in the worker,
with two copies of its module state. Nothing throws. A store written through one copy
reads back unset through the other.

Identical paths do not prevent this. Measured in July (enterprise blocker #1): a package
that both graphs load from the same file is still two instances. The invariant is
therefore **one owner per file for the life of its evaluation**, not agreement on paths.

## What enforces ownership today

`src/native/ownership.mjs` builds one immutable policy per project. `decideFile(file)`
returns `owner: 'vite' | 'node' | 'vitest-default'`:

| reason | owner | consulted by |
| --- | --- | --- |
| `test-entry` | vite | `server.deps.inline` (apply.ts) |
| `react-native-core` | node | `server.deps.external`, hooks, loader, registry |
| `explicit-transform`, `ecosystem-detected`, `runtime-transform` | node | external patterns, hooks/loader compile matchers |
| `project-source` | vite | hooks (`checkProjectSourceResolvedByNode`) |
| `identity-sensitive-runtime`, `test-runtime`, `delegated` | vitest-default | hot reset residency |

Two checks read it, and both are partial:

- `plugin.ts` `transform()` throws `MODULE_OWNER_CONFLICT` when Vite transforms a file
  the policy gives to Node. This is fail-closed, but it only sees the Vite half, and it
  is off under `server.deps.inline: true`.
- `hooks.mjs` `checkProjectSourceResolvedByNode` warns when an *installed* package
  makes Node resolve project source. It sees resolution, not evaluation, and it ignores
  requirers outside `node_modules`.

Neither check sees a file that both systems actually evaluate. The two open shapes below
pass both checks on main.

## Routes into each module system

Enumerated from the code. "Node" means the worker's main thread.

Node evaluates a file through:

1. **Vitest externalization.** Anything matching `server.deps.external` (the policy's
   `externalPatterns`) or Vitest's default externalization goes through
   `runExternalModule` → `import()` → `loader.mjs`. That serves compiled code through a
   CommonJS facade (`requireFacade`) or hands real ESM to Node.
2. **`require()` in Vite-evaluated code.** Vitest gives every inlined module
   `require = createRequire(url)` (vitest `module-evaluator.js`). That is plain Node.
   A test or project file that calls `require('./store')` loads Node's copy.
3. **jest-compat.** `jest.requireActual`, `requireMock` and `require` go through
   `node-registry.mjs`. It returns Vite's instance only when Vite has *already*
   evaluated the file (`viteInstanceOf`). A partial mock whose module is imported first
   loads Node's copy instead (PR #345's shape).
4. **Transitive requires from Node-evaluated code.** `hooks.mjs` `_resolveFilename`
   applies the project's aliases to requests from project files
   (`resolveAliasedRequest`). The `.ts`/`.tsx` handlers compile project TypeScript. A
   detected workspace sibling aliased to its source imports a Vite-owned sibling
   through Node (PR #344's shape).
5. **An installed package depending on the package under test.** This is the residual
   that `checkProjectSourceResolvedByNode` warns about (see workspace self-detection).
6. **Presets.** Shadowed packages never load. Their pass-through subpaths (JSON,
   assets, `mock`/`plugin`/`jest-utils`) load through Node.
7. **The precompiled registry.** React Native and `@react-native/*` run as factories
   inside one compiled file. They never reach `Module.prototype._compile`.
8. **The engine itself.** The hot worker (`worker.mjs`) imports the engine's runtime
   through Node. `setup.mjs` requires React Native and RNTL's matchers.
   `rntl-hooks.mjs` re-runs RNTL's entry on purpose.

Vite evaluates a file through:

1. Test entries and project source (the policy's `test-entry` and `project-source`).
2. `setupFiles`, including the engine's own `setup.mjs` and what it imports when the
   engine sits outside `node_modules` (this repository, linked installs).
3. `node_modules` packages that Vitest's defaults or a `server.deps.inline` rule keep
   inline. Node-owned ones throw `MODULE_OWNER_CONFLICT`. Delegated ones are not
   checked.
4. Aliases and tsconfig paths that resolve to a file nothing externalizes.
5. `vi.importActual`, `vi.mock(…, { spy: true })`, and the async `requireActual`
   rewrite from #345.

A dual evaluation is any pairing of a Node route with a Vite route on one file. Node
route 2, 3, 4 or 5 meeting Vite route 1 is the common bug. Node route 1 meeting Vite
route 3 is the `deps.inline` contested case from July.

### Legitimate dual evaluations

Only one class is exempt by rule:

- **The test runtime**: the engine's own files (its package directory, found from the
  guard's own location) plus `vitest`, `@vitest/*` and `chai`
  (`TEST_RUNTIME_RESIDENT_PATH`). The hot worker loads the engine through Node before
  any test file exists, and the setup file loads it through Vite. Every install in it
  is guarded on `globalThis` for exactly this reason (hooks.mjs header).

Everything else is a bug until shown otherwise. An exemption must name the file or
directory and a reason (`ownership.allow`). There is no switch that turns the guard off.

## Two lessons from reviewing the fixes

An adversarial review of the two open fixes (PR #344 for aliases, PR #345 for partial
mocks) found the same root cause in both: each subsystem decides "owner" its own way.

1. **The ownership predicate must be one function.** PR #345 decides "Vite-owned project
   source" from `this.resolve().external`. Vite never sets that field for SSR
   dependency externalization. So a partial mock of a detected workspace package, or of
   a `server.deps.external` project file, was rewritten to `vi.importActual`. It failed
   with a false `JEST_MOCK_FACTORY_CYCLE`, or a real ESM namespace was read as
   CommonJS. On main both shapes pass, and the guard reports nothing for them (checked
   with the reviewer's probes, stock and hot). Detection, `server.deps.external`, the
   jest-compat transform and the Node registry must all ask `decideFile`. None of them
   should re-derive the answer from Vite or Node resolver fields.
2. **Decide by resolution, not by alias text.** PR #344 matches alias replacement
   prefixes. On main, the same silent split also comes from tsconfig `paths`, an alias
   above every package (`'@pk': ws/packages`), a root alias (`'~': ws`), and a package
   whose `main` is its source (no alias at all). One regex alias over all packages
   fails loudly on main (`Cannot find module`), but becomes a silent split once alias
   prefixes are honoured. Text matching cannot see any of these. The ledger sees all of
   them, because it watches evaluations rather than configuration.

Measured on main with this guard, using the reviewer's probe workspace (`warn` mode):

| shape | split on main | guard |
| --- | --- | --- |
| string alias per package | yes | reported, `node-owned-source` |
| alias to a file | yes | reported |
| parent alias `@pk` → `packages/` | yes | reported |
| root alias `~` → workspace | yes | reported |
| `resolve.tsconfigPaths: true` | yes | reported |
| alias added by a later plugin | yes | reported |
| alias on an inline project | yes | reported |
| array-form string alias | yes | reported |
| package with `main: src/index.ts` | yes | reported (the dependency's store) |
| one regex alias for all packages | no: `Cannot find module` | nothing evaluated twice |
| tsconfig paths without `tsconfigPaths` | no: `Cannot find package` | nothing evaluated twice |
| RN dependency only the aliased package has | no: missing `@babel/runtime` | nothing evaluated twice |
| JSX in a sibling's `.js` | no: Vite parse error | nothing evaluated twice |
| #345 regressions (detected ESM package, external file) | no | no report (no false positive) |

`tests/ownership-guard-fixtures.test.ts` runs the string alias, tsconfig paths, parent
alias, root alias and source-`main` shapes, plus the partial mock.

### Option: workspace siblings are Vite's by default

Taken literally, "one owner per package" suggests not handing workspace siblings to
Node at all. That closes every alias-shaped split above. The cost is the case this
project already measured (workspace self-detection, August 2026): an installed React
Native package that requires the sibling by name. Node then loads its own copy, and the
split moves rather than disappears. A Node-owned sibling that requires another sibling
by name has the same problem. So does a sibling shipping JSX or Flow in `.js`, which
Vite will not parse without the engine's transform.

The recommended rule is ownership by resolution, in `decideFile`. A detected workspace
package becomes Vite's when Vite reaches a file inside its directory by anything other
than its package name: an alias, tsconfig paths, a relative path, or a `main` that is
source. Static inputs (aliases, tsconfig, manifests) are known at config time. Anything
else surfaces in the ledger as `node-owned-source` or `installed-package`, with the
file and both evaluators. The source-`main` shape needs the dependency closure as well:
its workspace dependency is reached by name from both sides.

## Design: one ledger per worker

`src/native/ownership-ledger.mjs` keeps one map per side, keyed by real path (forward
slashes, upper-case drive letter, see path-spelling-keys). On macOS and Windows the key
is also folded to lower case, because those file systems ignore case:
`require('./CaseStore')` and `import './casestore'` are one file. Asking the OS for the
stored case per compile cost about 10 µs per project require; folding costs nothing.
The price is a case-sensitive volume on those platforms holding two files whose names
differ only in case, each evaluated by a different side. They would be reported as one.

- **Node side.**
  - A wrapper on `Module.prototype._compile` covers every CommonJS evaluation,
    whichever hook compiled it. It also sees `require()` of an ES module on Node 24,
    where `_compile` gets format `module`; that case is labelled "require() of an ES
    module".
  - A wrapper on the `.mjs` extension covers `require()` of an ES module on Node 22.13,
    where it bypasses `_compile`.
  - A wrapper on the `.json` extension covers JSON, which Node parses without compiling.
  - **True ESM in this thread**: with `module.registerHooks` (Node 22.22.3+ and 24.12+),
    `loader.mjs` calls the ledger before Node evaluates the module.
  - **True ESM on the loader's own thread**: with `module.register` (the Node 22.13 CI
    legs, or `VITEST_NATIVE_LOADER_THREAD=1`), the loader posts each URL through a
    `MessagePort` the setup file passes it. The worker drains the port synchronously
    before every Vite evaluation and at the end of every file. There is no listener,
    so nothing keeps the worker alive and nothing throws from an event-loop callback.
    These records arrive after the module ran. In `error` mode they fail the file at
    its end rather than at the import.
- **Vite side.** The plugin appends one call, on lines of its own, to each module it
  hands the runner: `globalThis.__vitest_native_ownership_vite?.(key, file)`.
  - It runs as the module finishes evaluating, in every pool and on Vitest 4 and 5.
  - Under the native engine the transform is `order: 'post'`, after esbuild/oxc, and
    returns `map: null`: no code moves, so the previous map stands and there is no map
    work. Coverage is byte-identical to main. On a six-line file, main and this branch
    both report `DA:2,1 DA:3,1 DA:5,0 LF:3 LH:2`; the lcov files were compared byte for
    byte with `@vitest/coverage-v8`. `@vitest/coverage-istanbul` is not installed in
    this repository, so istanbul is unverified.
  - The marker's key is the real path, case-folded like Node's. Vite can keep a
    symlinked directory in an id, so the directory is real-pathed once and cached; a
    stat or two per module showed up as about 8% transform time on react-native-paper.
    A symlinked FILE inside a real directory is not resolved. That is a known gap; pnpm
    and workspaces link directories.
  - **Rejected: a marker at the top of the module.** It would let the ledger refuse a
    second Vite copy before its body ran, but it cost too much:
    - Remapping attributed the unmapped insertion to line 1, a phantom covered line
      (`LF:4 LH:3` against main's `LF:3 LH:2`).
    - The high-resolution map it needed cost 30–40% more transform time on
      react-native-paper; one 765 KB file went from 1.2 ms to 10.1 ms.
    - The maintainer's rule is no change in results or speed for existing users, so the
      marker is last. A Vite copy evaluated second is therefore seen after its body
      ran. In `error` mode its import throws (the message says "Vite's copy ran; this
      file fails") and the end-of-file check fails the test file.
    - A Node copy evaluated second is still refused before it runs.
  - The mock engine keeps the transform `pre`, because its Flow strip must run before
    esbuild.
  - Query-suffixed ids (`./x.ts?v=1`) are the file's own code and are recorded under
    the file. `?raw`, `?url`, `?inline` and worker queries serve something else and
    are skipped.

**Node records are per module, not per path.** Each record holds a `WeakRef` to its
module and the key Node cached it under. A dead record is dropped only once its module
has been garbage-collected. `jest.isolateModules` takes the outer copy out of the cache,
loads an inner one, and later puts the outer copy back. With one slot per path, the
restored outer copy was invisible. With per-module records it is seen again.

**The ledger keeps nothing alive.** A record holds a `WeakRef`, the cache key and the
parent's filename as a string. Measured with 200 modules of 2 MB each evicted from the
cache, the heap was 405 MB when records held the module strongly and 5 MB now. A
`WeakRef` target does survive until the end of the current job, so a synchronous loop
frees the memory only after its next `await`.

On a hit, the earlier record has to still be **live** before anything is reported:

- Node: `Module._cache[<key Node used>]` still holds that module. Under
  `--preserve-symlinks` that key is the link path, not the real path.
- Vite: `__vitest_worker__.evaluatedModules` has an evaluated or evaluating node for the
  file. This includes the `mock:<id>` node that `vi.mock(path, { spy: true })` runs the
  original under. Vitest 5 keeps that node outside the file index.

The liveness check is what makes per-file resets correct with no extra hooks. Hot
runtime resets drop Node's per-file modules (`module-reset.mjs`) and clear Vite's
graph. `jest.resetModules` and `isolateModules` do the same mid-file. Modules kept
resident (`RUNTIME_RESIDENT_PATH`, the hot baseline) stay in `Module._cache`, so a later
Vite evaluation of one of them is still caught. The registry's React Native modules
never pass through `_compile`. Vite transforming one of them already throws
`MODULE_OWNER_CONFLICT`.

The report names:

- the file;
- the policy owner and its reason;
- the first and second evaluator: Node with how it loaded the file and the requiring
  parent, or Vite with its importer;
- a short stack for a second Node evaluation;
- the route;
- the fix for that route.

Routes:

| route | meaning |
| --- | --- |
| `jest-compat` | jest-compat sets a depth counter around its synchronous loads |
| `installed-package` | a package under `node_modules` required it |
| `node-owned-source` | source Node evaluated imported it |
| `require-from-vite` | a `require` in a file Vite evaluated |
| `node-esm` | Node's ESM loader imported it |
| `vite-inline` | any file under `node_modules`, or one the policy gives to Node, that Vite also evaluated, in either order; `server.deps.inline` is the usual cause |

### Fail loud

- **At the evaluation.** In `error` mode a second Node evaluation throws before
  `_compile`, so it never runs. A second Vite evaluation has already run when its
  marker is reached; its import throws, so the copy is not handed to the importer.
- **At the end of each test file.** The setup file's `afterAll` lists every dual
  evaluation the file caused. A library's `try { require(x) } catch {}` turns the
  first throw into "x is not installed", and this check still fails the file in
  `error` mode. A conflict a test handles on purpose has to be removed from
  `ledger.conflicts`, as `tests-native/ownership-guard.test.ts` does.
- **At the end of the run.** The same findings travel in each file's task meta to a
  reporter the plugin adds in `configureVitest`. It prints a summary to stderr in both
  modes. Worker console output is dropped by `silent`, by reporters that print only
  failures, and by Vitest 5's agent reporter, so a warning printed only there could be
  missed. The summary also names `ownership.allow` entries that exempted nothing during
  the run.

### Cost, measured on Node 24.13 / macOS

| operation | cost |
| --- | --- |
| `recordNode` | about 0.24–0.32 µs |
| `recordVite` | about 0.11 µs |
| react-native-paper, cold transform cache, 6 interleaved runs each | main 617–725 ms (mean 664), branch 637–694 ms (mean 667): within noise |
| 3000-require benchmark, project files | 38–40 µs per require with or without the ledger (within noise) |
| 3000-require benchmark, `node_modules` | 34–37 µs per require with or without the ledger (within noise) |

A stack is captured only when a conflict is reported. The first version captured one
per project-file compile, which cost about 9 µs each.

The mode and the `allow` list reach the worker at run time and are kept out of the
plugin's transform cache key. Switching `VITEST_NATIVE_OWNERSHIP_MODE`, or the option,
re-transforms nothing. A test checks that the cache's entry count does not change. The
marker itself does not depend on the mode.

The end-of-run reporter starts each run empty, so in watch mode a fixed dual evaluation
stops being reported on the next run.

### Known limits

- The threaded loader's ESM records arrive after the fact, as described above.
- A Vite copy evaluated second runs before it is seen (see the Vite side above).
- **Unicode normalisation is untested.** APFS keeps a file name in the form it was
  created in, and macOS can hand a path back in NFD where an import spells it in NFC.
  If Node and Vite meet one file under the two forms, the keys differ and the dual
  evaluation is missed. Neither side normalises today. This is a known gap.
- A second copy inside one module system (two Node copies) is not this guard's job.

## Rollout

- `reactNative({ ownership: 'warn' })` is the default. Each dual-evaluated file is
  reported once per worker, and summarised at the end of the run.
- `ownership: 'error'` throws `MODULE_DUAL_EVALUATION` at the second evaluation, and
  fails the test file at its end.
- `ownership: { mode, allow: [{ path, reason }] }` lists exemptions. `path` is a file or
  directory, resolved against the Vitest root. `reason` is required.
  - An entry covering the project root itself (`'.'`, `'..'`, `'/'`) is refused with
    `INVALID_OPTION`. It would exempt every file the guard watches, which is turning
    the guard off. The guard has no off switch by design (the bake-off design's "no
    global ignore twins"). A project that needs a broad exemption names the
    directories.
  - Entries that exempted nothing in a run are listed in the summary, so a stale
    exemption cannot hide a new dual evaluation.
- `VITEST_NATIVE_OWNERSHIP_MODE=error|warn` overrides the mode for a whole run. Any
  other value is rejected with `INVALID_OPTION`, so a typo does not quietly mean
  `warn`.
- `ownership` under `engine: 'mock'` is ignored with a warning: there is one module
  system.
- CI in this repository sets `error` on every `test:native*` step. That includes the
  Node 22.13 legs, where Node's ESM records arrive through the loader port and fail at
  file end.
- **Next minor: the default flips to `error`.** The changeset for that release has to
  say so, and the warning text says so now.

### Who the flip affects most: `isolate: false`

Plain `isolate: false` without the hot runtime keeps Node's CommonJS cache for the
whole worker. A `require('./x')` in one file and an `import './x'` in a later file are
then two live copies in one worker, and the guard reports them. That is a real twin,
the same one `tests-native/jest-registry-no-isolate` exempts. Such suites have three
options:

- use the hot runtime, whose per-file reset drops Node's copy between files;
- replace the `require` with `import`, so both files use Vite's copy;
- exempt the file with a reason, accepting that its state crosses files.

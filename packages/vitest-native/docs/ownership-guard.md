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

`src/native/ownership-ledger.mjs` keeps two maps, keyed by real path (forward slashes,
upper-case drive letter, see path-spelling-keys):

- **Node side.** A wrapper on `Module.prototype._compile` covers every CommonJS
  evaluation, whichever hook compiled it. `loadSync` covers ESM, but only while the
  loader runs in the worker's thread (`module.registerHooks`, Node 22.22.3+/24.12+).
- **Vite side.** The plugin's `transform` appends one call to each module it hands the
  runner: `globalThis.__vitest_native_ownership_vite?.(key, file)`. It runs when the
  module finishes evaluating, in every pool and on Vitest 4 and 5. Appending moves no
  code, so the source map is returned as `null` (unchanged).

Each record is a `Map` lookup. On a hit, the earlier record has to still be **live**
before anything is reported:

- Node: `Module._cache[filename]` still holds the recorded module.
- Vite: `__vitest_worker__.evaluatedModules.getModulesByFile(file)` has an evaluated or
  evaluating node.

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
- the first evaluator: Node with its requiring parent, or Vite with its importer;
- the second evaluator with a short stack;
- the route, classified from the parent: an installed package, project source
  (`require`/`jest.requireActual`), or Node's ESM loader;
- the fix for that route.

Cost: one property read and one `Map` lookup per CommonJS compile and per Vite
evaluation. A stack is captured only when a conflict is reported.

Known blind spots, kept deliberately:

- JSON, which Node parses without compiling.
- ESM evaluated by the threaded loader (Node 22.13–22.22.2 and 24.0–24.11). The
  CommonJS half is still covered there, and that is where project source goes.
- A second copy inside one module system (two Node copies) is not this guard's job.

## Rollout

- `reactNative({ ownership: 'warn' })` is the default. Each dual-evaluated file is
  reported once per worker.
- `ownership: 'error'` throws `MODULE_DUAL_EVALUATION` at the second evaluation, so the
  second instance is never used.
- `ownership: { mode, allow: [{ path, reason }] }` lists exemptions. `path` is a file or
  directory, resolved against the Vitest root. `reason` is required.
- `VITEST_NATIVE_OWNERSHIP_MODE=error|warn` overrides the mode for a whole run. CI in
  this repository sets `error` on every native suite.
- Next minor: the default flips to `error`. The changeset for that release has to say
  so, and the warning text says so now.

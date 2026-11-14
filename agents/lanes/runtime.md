# Lane: runtime

The native engine: ownership, resolution, the Node front door, loaders, workers, the resident set and the hot runtime. It is the most tightly coupled code in the repository, so **only one worker runs in this lane at a time.** `agents/lanes.json` lists the files it owns.

**Where to look:**
- `src/plugin.ts`, `src/context.mjs`, `src/node-dispatch.mjs`, `src/cjs-bridge.ts`
- `src/native/`: `ownership.mjs`, `ownership-ledger.mjs`, `shared-resolver.mjs`, `hooks.mjs`, `registry.mjs`, `loader.mjs`, `pool.ts`, `worker.mjs`, `runner.mjs`, `setup.mjs`, `resident-health.mjs`, `reset.mjs`, `state-manifest.mjs`, `root-spelling.mjs`
- `tests-native/`

## Invariants
- **Decide ownership by package directory first, then by file.** Never decide by alias text, package name or first evaluator. Match names on whole path segments only, because pnpm and bun create decoy paths. (ADR 0004; `decideFile`, `match.mjs`)
- **Workspace members that declare `react-native`, and their workspace-dependency closure, stay Node-owned and compiled with the project's Babel.** Vite's Oxc would change their semantics. (ADR 0004)
- **Keep one resolver** shared by Vite `resolveId`, the Node CJS hook and the ESM loader. All three must agree, and `require` wins for dual-export packages. (ADR 0005; `shared-resolver.mjs`)
- **The resolution memo lives as long as the worker**, across module, world and `resetModules` resets. Failures are never cached, and each loader realm has its own memo. (ADR 0005)
- **The resolver field policy is internal.** There is no public option and no `'metro'` value. (ADR 0005, 0017)
- **Keep one Node front door.** Every `Module._load` / `_resolveFilename` interceptor is a ranked step in `node-dispatch.mjs` that receives `next`. Never assign `Module._*` directly. Precedence (mocks > preset > registry) changes only through a flagged entry judged against the oracle. (ADR 0007)
- **Chain hooks that other tools install later** (module-alias, pirates, proxyquire). Never throw on them. (ADR 0007)
- **Workers read configuration only from `projectContext()`**: `VITEST_NATIVE_CONTEXT` plus the listed escape hatches. A new input goes into the context schema, not a new env var. A bad context fails with `CONTEXT_INVALID`. (ADR 0003)
- **Compile caches are keyed on content plus source path.** `REGISTRY_FORMAT_VERSION` doesn't hash the generator: bump it whenever the generator changes. (ADR 0006)
- **Keep the resident set small:** React, scheduler, react-is and the renderer (`RUNTIME_RESIDENT_PACKAGES`). No resident module may bind a per-file module. A worker whose resident state is unusable is retired before reuse (`resident-health.mjs`). Read React internals; never write them. (ADR 0008)
- **Environment rows install in two groups:** boot-time, frozen per file, and per-file at `onBeforeCollect`. (ADR 0011)
- **Size the memory plan from the resolved worker count.** (ADR 0014)

## Settled decisions
- Fidelity beats memory. No optimisation that changes semantics, even as an opt-in. ESM→CJS facades are parked.
- Hot is not made resident. Library graphs live in a layered, precompiled registry, and RN's key never moves.
- Under the ownership models, `require` wins and one instance loads. This is documented; don't "fix" it.
- `ownershipModel: 'resolution'` implies `nodeMocks`. An explicit `nodeMocks: false` fails by name.
- No code ships without a production caller.
- The scorecard (patch sites, globals, swallowed catches, env vars) must not rise. Route new behaviour through the dispatcher or its channels.
- Batched one-worker hot admission is excluded. The matcher registry exists only inside `isolation: 'file'`. `@vitest/spy` 4.x retention is documented, not patched. Compiling only when Node throws a `SyntaxError` is excluded. (ADR 0014, 0006)

## Conventions
- **Every "is this file under the root?" check goes through `root-spelling.mjs`** (`rootSpellingOf`, `relativeToRoot`). Never use a raw `startsWith(root + sep)` or `path.relative`, because Windows 8.3 short names and letter case broke them. A lint rule enforces this.
- **Choose the realpath spelling deliberately and comment which one.** `fs.realpathSync` gives Node's spelling, which `Module._cache` keys use. `.native` gives Vite ids, which use forward slashes.
- **Generated code interpolates only `jsString(value)`.** Escape a path before building a regex from it (`escapeRegExp` from `src/regexp.ts`).
- **Compute fixed-per-run state once, in the plugin,** and pass it to workers. Test expensive per-file setup with counts.
- **Scope a resolution rewrite to the package that needs it.**

## Traps
- **A specifier has an extension only if it is a known source or asset extension.** `path.extname('./X.types')` returns `.types`.
- **When a fix changes a storage key, check every path that still loads by the old key.** One old key made a mock factory call itself recursively.
- **Count resolutions with a raw `_resolveFilename` counter.** Memo statistics miss absolute-path re-resolution.
- **Keep the dispatcher's `_resolveFilename` step.** `registerHooks` resolve is bypassed by `require.resolve` on Node 22.22.3 and 24.12–24.15.
- **Race tests must force the interleaving with promises.** Relying on timing passes with the bug present.
- **Run `bun run build` after merges.** The native configs import `dist/`.
- **Time from a worktree you are not editing.** A run refuses once `src/` changes after the last build. A script that clears `node_modules/.cache/vitest-native` must keep `build-stamp.json`.
- **React Native stays resident in a hot worker,** so anything added to its classes or prototypes is shared by every file in that worker. Probe a change like that across files, under hot and stock.
- **On Windows, pass child input through a temp file, not stdin.** Stdin held exit for 14 s.
- **Not ours:** Node 24.13.0 has a V8 GC SIGSEGV (exit 139, no output). The CI leg is pinned to 24.12.0.

## Verification
- **Path bugs:** reproduce on macOS with a root in different letter case, and run the Windows repro (`repro.yml`) before pushing code that keys on paths.
- **Changes to a served mock or the engine:** run the full `bun run test:native`. One change failed only under per-file module loading.
- **New gates:** reproduce from a clean fixture state with `CI=true`, and ask the engine for its paths instead of hard-coding them.

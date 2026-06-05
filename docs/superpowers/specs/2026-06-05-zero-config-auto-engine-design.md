# Zero-Config `auto` Engine — capability-based selection, native-preferred

**Status:** Design — approved direction (brainstormed 2026-06-05)
**Date:** 2026-06-05
**Author:** Daniel Fry (with Claude)
**Branch:** `design/dual-engine`

## 1. Goal

Make `vitest-native` deliver its best engine **with zero configuration**. Today `engine`
defaults to `'auto'`, but `'auto'` is a no-op that always resolves to `mock`. After this
change, `'auto'` performs **capability detection** and prefers the **native** engine — real
React Native, now proven fast (`docs/native-engine-performance.md`) and per-file isolated
(`docs/engine-comparison-evidence.md` §6.2) — whenever the project can support it, falling
back to `mock` otherwise. The choice is announced in one line.

This is the DX payoff of the dual-engine work: a developer installs the plugin, writes a
component test, and it runs against real RN, fast and correct, without choosing an engine.

**Prerequisite (met):** the native engine's shared-runtime correctness is settled — isolation
under `isolate:false` is total and measured, so defaulting toward native is safe.

## 2. Decisions (locked during brainstorming)

1. **Selection model:** capability-based, **whole run** (one engine per `vitest run`). Not
   per-glob and not per-file heuristic — those are explicit future work (§8). The two engines
   have incompatible Vite configs (native externalizes RN + `isolate:false`; mock virtualizes
   RN + `isolate:true`), so mixing them in one run would require vitest test-projects; out of
   scope here.
2. **Lean:** `auto` **prefers native** when deps are present, else mock.
3. **Loud:** always emit a **one-line diagnostic** naming the chosen engine and why.
4. **Rollout:** ship as a **minor release** with a changelog/migration note. `engine:'mock'`
   is the one-keystroke escape hatch. Existing users who have `@react-native/babel-preset`
   installed (most RN apps) and don't set `engine` will move from mock to native — this is
   intended and documented.

## 3. Capability detection — the rule

`auto` → **native** iff BOTH resolve from the consumer project root:
- `@react-native/babel-preset`
- `@babel/core`

(These are exactly what the native transform needs — `src/native/transform.mjs` requires both
to Flow-strip RN. `react-native` itself is required by either engine and is assumed present.)

Otherwise `auto` → **mock**. Resolution uses `createRequire(path.join(projectRoot,
"package.json")).resolve(...)` — the same mechanism as `src/validate.ts:validatePeerDependency`
— so it honors the consumer's real dependency tree (incl. monorepos).

Explicit `engine: 'native'` and `engine: 'mock'` bypass detection entirely (pass through).

## 4. Architecture & data flow

Engine resolution moves from **plugin construction time** (where the project root isn't known
yet) to the Vite **`config()` hook** (the first hook with the resolved root):

```
reactNative({ engine })                      // construction: requested = engine ?? 'auto'
  → Vite config(userConfig)                  // resolvedRoot = userConfig.root ?? process.cwd()
      → detectEngine(requested, resolvedRoot) // → { engine: 'native'|'mock', reason }
      → emit one-line diagnostic
      → store engine in plugin closure (let)
      → return native OR mock Vite config fragment   (existing branch)
  → configResolved(config)                   // reuse stored engine for ResolvedOptions.engine
  → resolveId / load / transform             // read stored engine (run after config())
```

`config()` is guaranteed to run before `resolveId`/`load`/`transform`, so a `let engine`
assigned in `config()` is set by the time the hooks read it. The construction-time value is
seeded to a safe default (`requested === 'native' ? 'native' : 'mock'`) so the closure is
never `undefined`.

## 5. Components & interfaces

### `src/native/detect.ts` (new — pure, no RN import, unit-testable)

```ts
export type RequestedEngine = "auto" | "mock" | "native";
export type ResolvedEngine = "mock" | "native";

export interface EngineDecision {
  engine: ResolvedEngine;
  /** One-line human reason for the diagnostic. */
  reason: string;
}

/** Resolve the concrete engine for a run. Pure; never throws. */
export function detectEngine(requested: RequestedEngine, projectRoot: string): EngineDecision;
```

Behavior:
- `requested === "native"` → `{ engine: "native", reason: "explicitly requested" }`.
- `requested === "mock"` → `{ engine: "mock", reason: "explicitly requested" }`.
- `requested === "auto"`:
  - both deps resolvable → `{ engine: "native", reason: "auto — found @react-native/babel-preset" }`.
  - else → `{ engine: "mock", reason: "auto — @react-native/babel-preset not found; install it + @babel/core for real-RN fidelity" }`.

### `src/plugin.ts` (modify)

- Replace the construction-time `const engine` with `let engine` seeded to the safe default,
  plus a `let engineDecided = false` guard.
- In `config()`: compute `resolvedRoot` (already done), call `detectEngine(requested,
  resolvedRoot)`, set `engine`, log the diagnostic once, then branch as today.
- In `configResolved()`/`resolveOptions`: use the already-decided `engine` rather than
  re-deriving from `options.engine` (so `ResolvedOptions.engine` matches the runtime choice).
- Diagnostic format: `[vitest-native] engine: <engine> (<reason>)` — printed once via
  `console.log` (always on; it is a meaningful selection, not verbose diagnostics).

### `src/types.ts` (doc-only)

`engine` already documents `'auto'` default; update the `'auto'` line to: "picks
automatically — **native** when `@react-native/babel-preset` is present, else `mock`."

### Repo config (pin to mock)

- `packages/vitest-native/vitest.config.ts` → `reactNative({ engine: 'mock', diagnostics: true })`.

Rationale: this suite asserts **mock** behavior (e.g. host name `"Text"`, virtual-module
exports), and babel-preset IS resolvable from the package dir (it's a devDep here), so `auto`
would now pick native and break the 1164 tests. Pinning is both correct here and the
canonical migration step real users will take.

**Example app (`apps/example/vitest.config.ts`) — no change needed.** Verified: from the
example app, `@react-native/babel-preset` and `@babel/core` do **not** resolve (they are
vitest-native's devDeps, outside the example's resolution scope), so its `reactNative()` (no
engine) resolves to **mock** automatically. The example therefore doubles as a live check of
the `auto` → mock fallback path; we only confirm it stays green.

### Docs + release

- `packages/vitest-native/README.md` — update the `engine` section: `auto` now prefers
  native; add a short **migration note** ("`auto` selects native when
  `@react-native/babel-preset` is installed; set `engine: 'mock'` to keep the previous
  behavior").
- Changeset (`.changeset/*.md`) — **minor** bump describing the new `auto` behavior + escape
  hatch.

## 6. Error handling & edge cases

- **`auto` never throws.** Missing deps → mock + the helpful one-line reason.
- **Explicit `engine:'native'` with missing deps** — unchanged: `transform.mjs` throws its
  existing clear install error when it first transforms RN.
- **Detection cost** — two `require.resolve` calls at config time, negligible; no caching
  needed.
- **Monorepo** — resolution is rooted at the consumer project root (Vite's `root` or cwd),
  matching how the native transform itself resolves the preset.
- **Diagnostic noise** — exactly one line per `vitest run`, not per file (it's emitted in
  `config()`, which runs once).

## 7. Testing strategy

All tests run under the repo's (now mock-pinned) default config except where noted.

All roots in these tests are **explicit** (never `process.cwd()`) so they're deterministic
regardless of where vitest is launched. Anchor the "deps present" root to the package
directory the same way `tests/native-unit.test.ts` already does (walk up from
`import.meta.url` to the dir containing `package.json` — the package dir, where
`@react-native/babel-preset` resolves).

1. **`tests/detect.test.ts` (new, pure):**
   - `detectEngine("native", anyRoot).engine === "native"`; same for `"mock"`.
   - `detectEngine("auto", <package dir>).engine === "native"` (deps resolve from here).
   - `detectEngine("auto", <fresh temp dir with an empty package.json>).engine === "mock"`.
     (Create the temp dir + `package.json` in the test via `os.tmpdir()`; this exercises the
     real resolver against a root lacking the deps.)
2. **Plugin routing (extend `tests/native-unit.test.ts`):**
   - `reactNative({})` (no engine) — call `config({ root: <package dir> }, …)` with the
     explicit package-dir root. The returned config has `test.server.deps.external` matching
     `react-native` and a native setup file (i.e., `auto` chose native), and
     `resolveId("react-native")` is `undefined`.
   - `reactNative({})` with `config({ root: <deps-free temp dir> }, …)` → returns the **mock**
     config (no `server.deps.external` for RN; `setupFiles` is the mock setup).
   - `reactNative({ engine: "mock" })` still virtualizes (`resolveId` → `\0virtual:react-native`).
3. **Diagnostic:** spy `console.log`; assert one `[vitest-native] engine:` line on `config()`.
4. **Regression:** repo mock suite stays green (**1164**) under the pinned `engine:'mock'`
   config; native suite stays green (**39**); example app stays green resolving to mock via
   `auto` (no pin) — confirming the fallback path end-to-end.

## 8. Non-goals (future specs)

- **Per-glob / mixed engines** in one run (vitest test-projects). The natural follow-up once
  whole-run auto ships.
- **Per-file import heuristics** (RNTL/component detection).
- **Boundary shim over Meta's `jest/mocks/*`**, RNTL v14, RN version matrix, third-party lib
  breadth, LogBox act() warning (tracked separately).
- **Merge / release execution** beyond adding the changeset.

## 9. Success criteria

1. `reactNative()` with no `engine`, in a project that has `@react-native/babel-preset` +
   `@babel/core`, runs the **native** engine — verified by a routing test and by a real
   no-config native render passing.
2. The same plugin in a project lacking those deps resolves to **mock** (verified via
   `detectEngine` against a deps-free temp root) and never throws.
3. Exactly one diagnostic line names the chosen engine and reason per run.
4. The repo's mock suite (1164) and native suite (39) remain green with the repo config
   pinned to `engine:'mock'`; the example app remains green resolving to mock via `auto`
   (unpinned — exercises the fallback).
5. README documents the new `auto` behavior + migration note; a minor changeset is added.

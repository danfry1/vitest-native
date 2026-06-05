# Zero-Config `auto` Engine — capability detection + native nudge (flip on v1)

**Status:** Design — approved direction (brainstormed 2026-06-05)
**Date:** 2026-06-05
**Author:** Daniel Fry (with Claude)
**Branch:** `design/dual-engine`

## 1. Goal

Move `vitest-native` toward a zero-config, native-by-default experience **without breaking
the published, in-use package.** This iteration builds the capability-detection machinery and
makes the native engine a first-class, loudly-surfaced opt-in, while keeping the current
default behavior (`auto` → mock) **unchanged** so no existing user breaks on upgrade. A single
`const` flip (planned for **v1.0**, a major release with a migration guide) later makes `auto`
prefer native.

Concretely, after this change:
- `engine: 'native'` and `engine: 'mock'` work exactly as today (explicit, unchanged).
- `engine: 'auto'` (the default) still resolves to **mock** — *but* when the project could run
  native (`@react-native/babel-preset` + `@babel/core` present), it prints a one-line **nudge**
  recommending `engine: 'native'` and noting it becomes the default in v1.
- The flip to native-preferred `auto` is a one-line policy change, covered by a test, reserved
  for v1.0.

**Why not flip now:** a default-engine change is a breaking change for a used package (a
project on `auto` today gets mock; a silent flip to native could break tests asserting
mock-specific behavior like `"Text"` vs `"RCTText"`). Semver-honest = flip on a major.

**Strategic context:** the mock engine is **kept** — it is the zero-dependency / pure-logic /
determinism fast-lane (no babel deps, faster cold-start, no real-RN dev warnings). It moves to
**stable/maintenance mode** (keep green, fix bugs; stop growing its fidelity — that is native's
job). Native is the recommended, fidelity-first engine and the future default. We maintain one
*growing* engine (native) and one *frozen* fast-lane (mock), not two competing engines.

**Prerequisite (met):** native's shared-runtime correctness is settled — isolation under
`isolate:false` is total and measured (`docs/engine-comparison-evidence.md` §6.2) — so steering
toward native is safe.

## 2. Decisions (locked during brainstorming)

1. **Selection model:** capability-based, **whole run** (one engine per `vitest run`). Not
   per-glob, not per-file heuristic — those are explicit future work (§8). The two engines have
   incompatible Vite configs (native externalizes RN + `isolate:false`; mock virtualizes RN +
   `isolate:true`), so mixing them in one run would need vitest test-projects; out of scope.
2. **Lean & rollout:** **nudge now, flip on v1.** This release (minor, non-breaking): `auto`
   still → mock; emit a native nudge when the project is native-capable. v1.0 (major): a
   one-`const` flip makes `auto` prefer native, shipped with a migration guide.
3. **Loud:** a single concise line per run — the nudge (now), or the auto-selection
   announcement (after the v1 flip).
4. **Keep mock:** retained as the stable zero-dep fast-lane; `engine: 'mock'` is the permanent
   escape hatch.

## 3. Capability detection + policy

**Native-capable** iff BOTH resolve from the consumer project root:
- `@react-native/babel-preset`
- `@babel/core`

(Exactly what `src/native/transform.mjs` needs to Flow-strip RN; `react-native` is assumed
present for either engine.) Resolution uses `createRequire(path.join(projectRoot,
"package.json")).resolve(...)` — the same mechanism as `src/validate.ts:validatePeerDependency`
— honoring the consumer's real dependency tree (incl. monorepos).

**Policy constant** `AUTO_PREFERS_NATIVE`:
- `false` now (v0.x) → `auto` resolves to mock (non-breaking).
- flip to `true` at v1.0 → `auto` resolves to native when capable.

**Resolution table:**

| `requested` | native-capable | `AUTO_PREFERS_NATIVE` | resolved engine | notice (one line) |
|-------------|----------------|------------------------|-----------------|-------------------|
| `native` | — | — | native | none (explicit) |
| `mock` | — | — | mock | none (explicit) |
| `auto` | yes | `false` (now) | **mock** | **nudge** → recommend `engine:'native'` |
| `auto` | no | `false` (now) | mock | none (can't run native — don't nag) |
| `auto` | yes | `true` (v1) | **native** | announce auto-selected native |
| `auto` | no | `true` (v1) | mock | none |

## 4. Architecture & data flow

Engine resolution moves from **plugin construction time** (project root unknown) to the Vite
**`config()` hook** (first hook with the resolved root):

```
reactNative({ engine })                       // construction: requested = engine ?? 'auto'
  → Vite config(userConfig)                    // resolvedRoot = userConfig.root ?? process.cwd()
      → detectEngine(requested, resolvedRoot)   // → { engine, nativeAvailable, notice }
      → if notice: console.log(notice) once
      → store engine in plugin closure (let)
      → return native OR mock Vite config fragment   (existing branch)
  → configResolved(config)                     // reuse stored engine for ResolvedOptions.engine
  → resolveId / load / transform               // read stored engine (run after config())
```

`config()` runs before `resolveId`/`load`/`transform`, so a `let engine` assigned there is set
when the hooks read it. The construction-time value is seeded to a safe default
(`requested === 'native' ? 'native' : 'mock'`) so the closure is never `undefined`.

## 5. Components & interfaces

### `src/native/detect.ts` (new — pure, no RN import, unit-testable)

```ts
export type RequestedEngine = "auto" | "mock" | "native";
export type ResolvedEngine = "mock" | "native";

/**
 * Whether `auto` prefers native when the project supports it.
 * v0.x: false (auto → mock, non-breaking; nudges toward native).
 * v1.0: flip to true to make native the zero-config default.
 */
export const AUTO_PREFERS_NATIVE = false;

export interface EngineDecision {
  engine: ResolvedEngine;
  /** True when @react-native/babel-preset + @babel/core resolve from projectRoot. */
  nativeAvailable: boolean;
  /** One concise line to print once, or null for silence. */
  notice: string | null;
}

/** Resolve the concrete engine for a run. Pure; never throws. */
export function detectEngine(
  requested: RequestedEngine,
  projectRoot: string,
  opts?: { autoPrefersNative?: boolean },
): EngineDecision;
```

Behavior:
- `requested === "native"` → `{ engine: "native", nativeAvailable: <check>, notice: null }`.
- `requested === "mock"` → `{ engine: "mock", nativeAvailable: <check>, notice: null }`.
- `requested === "auto"` (let `cap = nativeAvailable`, `pref = opts.autoPrefersNative ??
  AUTO_PREFERS_NATIVE`):
  - `pref && cap` → `{ engine: "native", nativeAvailable: true, notice:
    "[vitest-native] engine: native (auto — found @react-native/babel-preset)" }`.
  - `!pref && cap` → `{ engine: "mock", nativeAvailable: true, notice:
    "[vitest-native] native engine available — set engine:'native' for real-RN fidelity (becomes the default in v1)" }`.
  - `!cap` → `{ engine: "mock", nativeAvailable: false, notice: null }`.

The injectable `autoPrefersNative` lets tests lock **both** the current (mock+nudge) and the
future-v1 (native) behavior deterministically; the plugin passes the module default.

### `src/plugin.ts` (modify)

- Replace the construction-time `const engine` with `let engine` seeded to the safe default.
- In `config()`: compute `resolvedRoot` (already done), call `detectEngine(requested,
  resolvedRoot)`, set `engine`, `console.log(decision.notice)` if non-null (once), then branch
  as today.
- In `configResolved()`/`resolveOptions`: use the decided `engine` rather than re-deriving from
  `options.engine`, so `ResolvedOptions.engine` matches the runtime choice.

### `src/types.ts` (doc-only)

Update the `engine` `'auto'` doc line: "picks automatically. Currently resolves to **mock**;
when `@react-native/babel-preset` is present it recommends `native` and will default to it in
v1."

### Repo config (pin to mock — future-proofing, not a fix)

- `packages/vitest-native/vitest.config.ts` → `reactNative({ engine: 'mock', diagnostics: true })`.

Today `auto` already resolves to mock, so behavior is unchanged — but pinning (a) keeps the
1164-test mock suite stable across the future v1 auto→native flip, and (b) suppresses the
native nudge in our own test output. **Example app (`apps/example/vitest.config.ts`) — no
change:** verified that `@react-native/babel-preset`/`@babel/core` do **not** resolve from the
example (they are vitest-native's devDeps), so its `reactNative()` resolves to mock and prints
no nudge. It doubles as a live check of the not-native-capable path.

### Docs + release

- `README.md` — update the `engine` section: document `auto`'s current behavior (mock + nudge),
  that native is recommended, and that it becomes the default in v1. Keep `engine:'mock'`
  documented as the permanent zero-dep fast-lane.
- Changeset — **minor** bump: "capability detection + native-engine nudge; `auto` unchanged
  (still mock) this release; native becomes the `auto` default in v1."

## 6. Error handling & edge cases

- **`auto` never throws.** Not native-capable → mock, silent.
- **Explicit `engine:'native'` with missing deps** — unchanged: `transform.mjs` throws its
  existing clear install error at first RN transform.
- **Nudge frequency** — exactly one line per `vitest run` (emitted in `config()`, which runs
  once), and only for `auto` + native-capable. Explicit `mock`/`native` are silent (unless the
  existing `diagnostics: true` logging applies).
- **Detection cost** — two `require.resolve` calls at config time; negligible.
- **Monorepo** — rooted at the consumer project root (Vite `root` or cwd), matching how the
  native transform resolves the preset.

## 7. Testing strategy

All roots in these tests are **explicit** (never `process.cwd()`) for determinism regardless of
launch dir. Anchor the "deps present" root to the package directory the way
`tests/native-unit.test.ts` already does (walk up from `import.meta.url` to the dir with
`package.json` — the package dir, where `@react-native/babel-preset` resolves).

1. **`tests/detect.test.ts` (new, pure):**
   - `detectEngine("native", anyRoot).engine === "native"`; `detectEngine("mock", anyRoot).engine === "mock"`; both `notice === null`.
   - `detectEngine("auto", <package dir>)` → `engine === "mock"`, `nativeAvailable === true`,
     `notice` contains `"native engine available"` (current policy, default `AUTO_PREFERS_NATIVE`).
   - `detectEngine("auto", <package dir>, { autoPrefersNative: true })` → `engine === "native"`
     (locks the future v1 flip behavior).
   - `detectEngine("auto", <fresh temp dir + empty package.json>)` → `engine === "mock"`,
     `nativeAvailable === false`, `notice === null`. (Create temp dir under `os.tmpdir()`.)
2. **Plugin routing (extend `tests/native-unit.test.ts`):**
   - `reactNative({})` (no engine) with `config({ root: <package dir> }, …)` → returns the
     **mock** config (no RN `server.deps.external`; mock setup file), since `auto` → mock now.
   - `reactNative({ engine: "native" })` with `config({ root: <package dir> }, …)` → native
     config (RN `server.deps.external`, native setup file); `resolveId("react-native")` is
     `undefined`.
   - `reactNative({ engine: "mock" })` still virtualizes (`resolveId` → `\0virtual:react-native`).
3. **Nudge:** spy `console.log`; `reactNative({})` + `config({ root: <package dir> }, …)` emits
   exactly one line containing `"native engine available"`; `config({ root: <deps-free temp
   dir> }, …)` emits no such line.
4. **Regression:** repo mock suite green (**1164**) under pinned `engine:'mock'`; native suite
   green (**39**); example app green resolving to mock via `auto` (unpinned — exercises the
   not-capable path).

## 8. Non-goals (future specs / releases)

- **The v1 flip itself** (changing `AUTO_PREFERS_NATIVE` to `true` + migration guide + major
  release). This spec only builds the machinery and reserves the one-line flip.
- **Per-glob / mixed engines** in one run (vitest test-projects).
- **Per-file import heuristics.**
- **Boundary shim over Meta's `jest/mocks/*`**, RNTL v14, RN version matrix, third-party lib
  breadth, LogBox act() warning (tracked separately).

## 9. Success criteria

1. `engine` resolution happens at `config()` time via the pure `detectEngine`; explicit
   `'native'`/`'mock'` are unchanged.
2. `auto` still resolves to **mock** this release (no breaking change); a project that is
   native-capable sees exactly one nudge line recommending `engine:'native'`; a non-capable
   project sees none and never throws.
3. The future v1 flip is a one-line change (`AUTO_PREFERS_NATIVE = true`) and is locked by a
   test (`detectEngine("auto", pkgDir, { autoPrefersNative: true }) === native`).
4. Repo mock suite (1164) and native suite (39) stay green (repo pinned to `engine:'mock'`);
   example app stays green via `auto` → mock.
5. README documents `auto` (mock + nudge now, native in v1) and mock as the permanent zero-dep
   lane; a minor changeset is added.

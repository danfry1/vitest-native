# Ownership model: `experimental.ownershipModel`

Under the native engine two module systems run in one worker: Vite owns tests and
project source, Node owns React Native and installed packages. A package loaded by both
must be one module. Agreeing on a path is not enough: when Vite's `resolveId`, Node's
CommonJS loader and Node's ESM loader each resolve on their own, a dual-export package,
an alias, or a deep conditional export lands on different files, and the package exists
twice, with two copies of its state.

```ts
reactNative({ experimental: { ownershipModel: "resolver" } });
```

With `'resolver'`, all three resolve bare requests through one resolver
(`src/native/shared-resolver.mjs`), built from one record in the project context
(`resolverInputs`): the project root, platform, source extensions, every alias (Vite's
`test.alias` and `resolve.alias`, then tsconfig `paths`), `--preserve-symlinks`, and
the CommonJS conditions Node applies in the workers. This is the first step of ADR-0004
and ADR-0005; `'resolution'`, with the ownership predicate, comes later.

## What changes with the flag on

- **`require` wins.** Where a package's `exports` map has both `import` and `require`
  builds, Vite loads the `require` one too, so a test's `import` and a library's
  `require` reach the same object. A Vite-side import of such a package can therefore
  load a different file than before.
- **The `react-native` main field wins for both sides.** A package without `exports`
  that sets a string `react-native` field: Vite already loaded it; Node's `require` now
  loads it too, instead of `main`.
- **An alias a worker cannot apply is refused** at startup, by name (a custom resolver,
  a function replacement), instead of applying in Vite only.
- **RegExp aliases and tsconfig `paths` apply on Node's side too**, including in
  `jest.requireActual`: the resolver's record is the only alias record the workers get.
- **React Native's own requires of installed packages** (`react`, `invariant`, ...) are
  resolved by the same resolver when the precompiled registry is built, from the React
  Native file that asks, and baked in: a worker resolves none of them at run time. The
  registry is built once the resolver's inputs are final (in `configureVitest`), and is
  keyed by their hash.

Relative and absolute requests, Node's built-ins, React Native itself and the test
runtime (Vitest, Vite, chai) are not answered by the resolver: their resolution is
already shared, or another owner answers it.

## How it fails

- **`RESOLVER_INPUT_MISMATCH`**: a realm's copy of the record does not hash to the
  context's, or Node applies a different set of conditions in that realm than the
  record holds (for example `--conditions` set for some workers but not others).
  Conditions compare as sets.
- **`RESOLVER_INPUTS_MISSING`**: the flag is on but a realm has no record to build its
  resolver from (a worker started without the plugin's `configureVitest` step), or Vite
  resolves for a project the plugin recorded no inputs for. No realm resolves as if the
  flag were off, and no project uses another project's resolver.
- **Fallbacks are counted, never silent.** A request the resolver cannot answer because
  nothing is installed (`MODULE_NOT_FOUND`, a subpath the package does not export) is an
  allowed `unresolved` fallback, answered by Node as before. Any other error is counted
  as `error` with the request named; the native suite runs with the flag on and fails a
  file on any, and fails the run when Vite's realm, which resolves in the main process,
  counted any.

## The resolution shadow

With `diagnostics: true`, two realms also ask the resolution the flag replaces, once per
distinct request, and write each request answered differently as one JSON line to
`<cache>/ownership-shadow/<inputs hash>.jsonl`, which the run names at startup:

- Node's CommonJS hooks, against Node's own `require` (Node failing where the resolver
  answers, as for a RegExp alias, is written too);
- Vite, against the resolution it used before the flag where that answers (where it
  declines, Vite's own resolution would have answered, which is not computed).

The ESM loader writes none. Without `diagnostics` the second resolution is not made.

## Precedence

Unchanged from the flag off, in order: a test's `vi.mock`, a preset's shadow (virtual
modules on the Vite side, the require hooks' redirect on Node's), React Native's facade,
then resolution. The shared resolver replaces only the last step's bare-request
answer; jest-compat's `jest.mock` acts in `Module._load`, before resolution.

## Not covered yet (declared)

Shared resolution cannot close crossings between a project module and the compilers.
Each has a bug-museum exhibit, and is unchanged by the flag:

| Exhibit | What happens | Why resolution cannot fix it |
| --- | --- | --- |
| `own-alias-import-meta` | Project source that uses `import.meta`, reached through Node's `require`, fails to compile | Node's CommonJS compile has no `import.meta` |
| `own-jest-require-imported-cjs` | Project CommonJS loaded through jest-compat's `require` is a second instance of the one the test imported | Node's registry and Vite's module graph each evaluate it |
| `own-partial-mock-store` | A partial mock's real implementation and the app hold separate stores | The mock's `importOriginal` and Node's load are separate evaluations |

These are the ownership predicate's to decide (`'resolution'`): one owner per file, and
a named error where the bridge cannot be crossed.

## Flags live at once

ADR-0001 allows two behaviour-change flags at a time.

| Flag | Since | Decide by |
| --- | --- | --- |
| `experimental.ownershipModel` | 0.15.0 | 2026-12-15 |

Library-mock re-lands ship as ordinary releases on `next`, one library at a time, not
as flags. The table in `src/flags.ts` is the source of truth; `tests/flags.test.ts`
fails a release past a decision date.

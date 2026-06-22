# Package-manager resolution matrix

The native engine resolves React Native at the **Node layer** (`Module._resolveFilename`,
`Module._extensions`, and an ESM loader hook), *outside* Vite's resolver — because RN is
externalized. That makes it directly exposed to the on-disk shape each package manager
produces, which differ sharply:

| Manager | Layout | Resolution |
| --- | --- | --- |
| npm / yarn-classic | hoisted, flat | permissive (phantom deps resolve) |
| pnpm | symlinked `.pnpm` store | strict; realpath matters |
| bun | isolated `.bun` store | strict, like pnpm |
| yarn PnP | no `node_modules` | `.pnp.cjs` resolver — **not yet supported** |

## What this harness proves

`run.sh` installs a minimal real RN + RNTL suite under **npm, pnpm, and bun**, and runs it in
two scenarios:

- **clean** — a normal single-React install. Verifies the engine resolves and renders
  identically across all three managers.
- **split** — a second physical `react` is planted inside `react-native`'s own
  `node_modules`, so the externalized RN graph resolves a *different* React instance than the
  test/renderer. This is the everyday monorepo / version-skew / strict-store condition.

React keeps its hooks dispatcher as module-level state, so two physical copies = two
dispatchers = `Invalid hook call`. Vitest's `resolve.dedupe` enforces a single copy in the
Vite graph, but it does **not** reach the externalized Node graph. vitest-native re-establishes
the single instance at the Node boundary (the `REACT_SINGLETON` dedupe in
`src/native/hooks.mjs` and `src/native/loader.mjs`), so the **split** scenario passes too.

## Running

```bash
bash pm-matrix/run.sh
```

Requires `npm`, `pnpm`, and `bun` on `PATH` (missing managers are skipped). Installs run in a
temp dir outside the repo. Expected result:

```
npm  | clean(react=1): PASS | split(react=2): PASS
pnpm | clean(react=1): PASS | split(react=2): PASS
bun  | clean(react=1): PASS | split(react=2): PASS
```

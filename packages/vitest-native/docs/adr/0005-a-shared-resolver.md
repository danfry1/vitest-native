# 0005-a. Resolve for Vite, Node's require and the ESM loader through one resolver with a worker-lifetime cache

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: the shared resolver is on main behind `experimental.ownershipModel` (`'resolver'` or `'resolution'`), off by default; `alignLegacyFieldsWithNode` and the export-condition recovery it was to delete remain.
- **Enforced by:** `packages/vitest-native/tests/shared-resolver.test.ts`, `packages/vitest-native/tests/shared-resolver-cost.test.ts`, `packages/vitest-native/tests/registry-shared-resolver.test.ts`, `packages/vitest-native/tests/metro-resolver-oracle.test.ts`
- **Related:** [0004-a](0004-a-owner-per-package.md) (picks the owner first), [0003-a](0003-a-project-context-file.md) (holds its inputs), [0001-b](0001-b-capped-flag-table.md) (its flag)

## Decision

One pure, filesystem-only `resolve(request, from)` answers bare requests for Vite's
`resolveId`, Node's `_resolveFilename` and the ESM loader's `resolve`, built from one record of
inputs. Its cache is keyed by (directory, request, conditions), lives as long as the worker,
and survives module resets, world resets and `resetModules`; failures are not cached.
Platform extensions are tried extension-major, as Metro does. A library's own Jest resolver
runs only for files that library owns, never by substring match on a directory name.

## Context

The same request resolved to different files depending on who asked: 196 of 565 export-map
packages in obytes and 62 of 269 in Paper give `import` and `require` different files, and
without `exports` Vite reads `react-native` and `module` while Node reads `main`. No check keyed
on a file name sees that. Node does not cache exports-map resolutions, and the hot reset
drained its relative cache, so one library mock re-resolved about 347 modules per file; a
worker-lifetime memo took resolutions from 168 to 22 and source reads from 353 to 43 per file
(per-file counts on the 60-file gesture-handler and reanimated suite). A prototype with all
three routes sharing one resolver fixed the alias and identity probes; disabling only the ESM
route broke dynamic-import identity. Evidence kept privately.

## Consequences

- **Gains:** closes the different-file twin class.
- **Costs:** the resolver becomes the hottest path and replaces Node's C++ manifest reader on
  cold misses. Kill criterion: more than 22 resolutions per file + 10% on that suite, any cache
  miss on the second file, or more filesystem calls per cold miss than Node.
- **Limits:** fallbacks are counted and named (`RESOLVER_INPUT_MISMATCH`,
  `RESOLVER_INPUTS_MISSING`, `RESOLVER_ERROR`); "nothing installed" falls back to Node.

## Alternatives rejected

- Two resolvers aligned after the fact: cannot see export-map splits.
- The real `metro-resolver`: splits import from require, so it cannot give one answer per
  name; it stays as the oracle.
- One cache across loader threads: each realm owns its memo.

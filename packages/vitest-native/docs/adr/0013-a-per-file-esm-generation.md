# 0013-a. Re-evaluate true ES modules per test file by stamping a generation on their URL

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/loader-generation-stamp.test.ts`, `packages/vitest-native/tests/loader-preset-generation.test.ts`, `packages/vitest-native/tests/generation-facade.test.ts`, `packages/vitest-native/scripts/test-hot-generation-parity.mjs`, `packages/vitest-native/scripts/test-hot-memory.mjs`
- **Related:** [0013-b](0013-b-one-esm-interop-policy.md), [0013-c](0013-c-loaders-decide-nothing-per-file.md)

## Decision

Under the hot runtime, the ESM loader stamps a per-file generation (`?vnhot=N`) on the
URL of each module Node should evaluate again for the next test file, so a package's
module-level state does not carry across files. It stays on by default
(`hotRuntime.esmGeneration`).

## Context

Node caches ES modules by URL and cannot invalidate them. Without a new URL per file, a
package imported as ESM keeps its state from the first file that loaded it, which per-file
isolation would not. An early version of the stamping also stamped the test-runtime
packages and created a twin runtime: Paper's passing tests fell from 603 to 473. Keeping
those packages resident fixed it.

Measured on obytes: 383 true-ESM URLs from 17 packages, of which 27 re-loaded across
files, all from stateful packages (i18next, react-i18next, tailwind-variants). Keeping
them resident changed wall time by about −1%, within noise, with identical results.
Evidence kept privately.

## Consequences

- **Gains:** no behaviour change for users; packages that hold state behave as under
  per-file isolation.
- **Costs:** re-evaluation per file. A suite heavy in externalized packages measured up
  to 55% more wall clock than with stamping off. While stamping is on, hot workers leave
  Node's V8 compile cache off.
- **Limits:** a module Node's ESM registry holds is never freed. Generations served as
  CommonJS are released (`test-hot-memory.mjs` gates the heap slope); a generation an
  ES module imports is kept. Users can set `esmGeneration: false` and accept shared state.

## Alternatives rejected

- Compile true ESM to CommonJS: no better parity, about 1.6 ms per file, and
  `import.meta` needs special handling.
- Keep true ESM resident: the packages that re-load are the stateful ones, and the time
  saved was within noise. Reconsider if a corpus app re-loads more than 100 true-ESM
  URLs per file, or a heap snapshot finds more than 25 KiB per file of retained ESM
  module records, on the 1,125-file scale suite under hot.

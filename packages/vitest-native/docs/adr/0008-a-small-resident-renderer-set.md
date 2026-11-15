# 0008-a. Keep only React, scheduler, react-is and the installed renderer resident across files

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: the hot runtime's resident set also holds react-dom, react-reconciler, both renderers and RNTL (`RUNTIME_RESIDENT_PACKAGES`), and the boot-module budget is not recorded.
- **Enforced by:** Review only
- **Related:** [0008-b](0008-b-retire-unusable-resident-workers.md)

## Decision

In reuse modes (the hot runtime today, a future `isolation: 'file'`), the packages kept
loaded across test files are `react`, `scheduler`, `react-is` and only the renderer the
installed RNTL resolves to (`test-renderer` for RNTL 14, `react-test-renderer` for 12 and
13). The set is declared in the project context. The count of modules evaluated at boot
must not rise past it, and the preload may add at most 2 ms to boot plus the first file.

## Context

A fresh renderer per file costs 1.01–1.12x wall time and 1.03–1.17x RSS, and the RSS growth
rises with the number of files (measured on a generated suite at 225 and 1,125 files). So
the renderer stays resident. Every resident package is state that the per-file reset cannot
reach, which is why the set is kept as small as possible. Preloading costs about 2.5 ms for
react and about 7 ms with react-test-renderer in plain Node; the hot runtime already loads
these in the first file, so only the change matters.

Stock (fresh worker per file) and `'worker'` mode (recycle after every file) are out of
scope. Plain `isolate: false` without the hot runtime is left unprotected by choice and
should warn at config time.

## Consequences

- **Gains:** the scale and memory gains of a warm renderer, with the least resident state.
- **Costs:** resident packages read some environment values once, at boot (see [0011-a](0011-a-two-environment-install-groups.md)).
- **Limits:** `useId` counters, dev-warning dedupe, and `resetModules`/`isolateModules` keeping resident keys are documented divergences from Jest.

## Alternatives rejected

- A fresh renderer per file: fails at scale on RSS.
- No preload: the first file's timers leak into the rest of the run.

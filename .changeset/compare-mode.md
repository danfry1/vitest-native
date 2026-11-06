---
"vitest-native": minor
---

**New `vitest-native compare` runs your suite under your own Jest and under Vitest and lists every test whose result differs.** Use it while both runners are in place: `npx vitest-native compare` names each test that passes under Jest but not under Vitest, grouped by its first error, and exits 0 only when every one of them passes and `vitest run` exits 0. Neither run writes snapshots or changes project files, and `--json <file>` writes a report without stack traces or absolute paths, for attaching to an issue. See `docs/compare-mode.md`.

# Under hot, every file re-resolves a library's own-mock graph

- **Class:** per-file-state
- **Source:** M0 gate G3 (2026-10-28) and migration testing (2026-10) (the hot worker re-read the filesystem per file)
- **Fixed by:** #364 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

Reanimated's and Gesture Handler's own Jest mocks are a ~347-module CommonJS graph. Node's `Module._findPath` does not put exports-map resolutions in `_pathCache`, and the hot runtime's per-file reset drains `relativeResolveCache`, so every bare request in that graph re-resolved, and the `.ts` hook re-read sources, in EVERY test file: ~168 resolutions and ~353 reads per warm file against ~14 and ~13 before #336. As a cost it is timing; as a COUNT it is deterministic, which is what this exhibit asserts.

## Expected behaviour

A warm file (not the first in its worker) costs fewer than 60 `Module._resolveFilename` calls and 150 `fs.readFileSync` calls.

## Notes

Per-file counts are printed as `[museum:g3]` lines (MUSEUM_DEBUG=1 shows the output). The fix branch is a WIP commit (fdc443c) with no tests or parity run yet.

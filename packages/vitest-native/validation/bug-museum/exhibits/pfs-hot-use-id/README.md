# Under hot, useId carries over from the previous file

- **Class:** per-file-state
- **Source:** v1 hot-runtime cross-file leaks (2026-10-28 M0 gates)
- **Fixed by:** open (the v2 per-file world)
- **Needs:** nothing beyond this repository's install

## The bug

The hot runtime keeps React resident across test files. React's `useId` counter lives in the renderer, so the first id in the second file is `_r_1_` instead of `_r_0_`: a snapshot holding an id depends on which file ran before it in the worker.

## Expected behaviour

Every file sees the same first id (`_r_0_`), as under Jest and stock isolation.

## Notes

From the v1 hot-runtime leak repros (vitest-native-planning/v1-hot-leak-repros, M0 gate G1). Stock isolation passes both files; so does `--control`.

# Under hot, an un-awaited act in one file poisons the next file

- **Class:** per-file-state
- **Source:** v1 hot-runtime cross-file leaks (2026-10-28 M0 gates)
- **Fixed by:** open (the v2 per-file world)
- **Needs:** nothing beyond this repository's install

## The bug

File a leaves an async `act` scope open (`void act(async () => …)`). With React resident, the next file's render happens inside that still-open act scope and commits nothing: `toJSON()` is null and `getByText` fails in a correct file.

## Expected behaviour

A file's leaked act scope cannot affect the next file: b's ordinary render commits a tree.

## Notes

From the v1 hot-runtime leak repros (vitest-native-planning/v1-hot-leak-repros, M0 gate G1). Stock isolation passes both files; so does `--control`.

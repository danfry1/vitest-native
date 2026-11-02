# Under hot, React's warning dedupe hides a warning the file asserts

- **Class:** per-file-state
- **Source:** v1 hot-runtime cross-file leaks (2026-10-28 M0 gates)
- **Fixed by:** open (the v2 per-file world)
- **Needs:** nothing beyond this repository's install

## The bug

React warns about a missing `key` once per component type per renderer lifetime. With the renderer resident across files, the second file's identical list never warns, so a test asserting the warning fails depending on file order.

## Expected behaviour

Each file sees React's warning, as under Jest.

## Notes

From the v1 hot-runtime leak repros (vitest-native-planning/v1-hot-leak-repros, M0 gate G1). Stock isolation passes both files; so does `--control`.

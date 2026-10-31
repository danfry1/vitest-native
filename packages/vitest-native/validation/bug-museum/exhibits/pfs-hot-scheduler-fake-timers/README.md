# Under hot, the scheduler keeps the fake timers it loaded under

- **Class:** per-file-state
- **Source:** v1 hot-runtime cross-file leaks (2026-10-28 M0 gates)
- **Fixed by:** open (the v2 per-file world)
- **Needs:** nothing beyond this repository's install

## The bug

File a turns on fake timers before the renderer loads. React's scheduler captures the timer functions when it is first evaluated; resident across files, it keeps posting work with file a's FAKE setTimeout in file b, which uses real timers: the update never renders.

## Expected behaviour

File b's timer-driven update has rendered after 300 ms of real time.

## Notes

From the v1 hot-runtime leak repros (vitest-native-planning/v1-hot-leak-repros, M0 gate G1). Stock isolation passes both files; so does `--control`.

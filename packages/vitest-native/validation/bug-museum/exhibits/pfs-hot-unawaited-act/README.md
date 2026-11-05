# Under hot, an un-awaited act in one file poisons the next file

- **Class:** per-file-state
- **Source:** v1 hot-runtime cross-file leaks (2026-10-28 M0 gates)
- **Fixed by:** #452: fails by name, the accepted outcome with one worker
- **Needs:** nothing beyond this repository's install

## The bug

File a leaves an async `act` scope open (`void act(async () => …)`). With React resident, the next file's render happens inside that still-open act scope and commits nothing: `toJSON()` is null and `getByText` fails in a correct file.

## Expected behaviour

A file's leaked act scope must never make a correct file silently render nothing. With two
or more workers the hot runtime retires the worker after the leaking file and b passes
(`pfs-hot-act-scope-timeout`). With one worker, as here, Vitest runs every file as one task
and the worker cannot be replaced, so the accepted outcome since #452 is that b fails by
name: "hotRuntime: this worker cannot run this file: React's act() scope is still open
(react.act-scope) since a.test.tsx". The museum records that as FAIL (other): a failure,
but not this bug. The bug is the silent version, b's render committing nothing, which the
signature matches; `test:native:hot:act-scope` keeps the named error from turning silent.

## Notes

From the v1 hot-runtime leak repros (vitest-native-planning/v1-hot-leak-repros, M0 gate G1). Stock isolation passes both files; so does `--control`.

# Under hot, a test that times out inside act() fails every later file on its worker

- **Class:** per-file-state
- **Source:** #449
- **Fixed by:** #449's fix (draft, `fix/hot-act-scope-retire`)
- **Needs:** nothing beyond this repository's install

## The bug

A test times out while awaiting `act()`. Vitest moves on, but React's act() scope never closes, and React stays loaded across the hot worker's files. Every render a later file makes on that worker queues inside the open scope and never commits, so correct files fail with `Unable to find an element with text: hello`. Under per-file isolation only the timed-out test fails.

## Expected behaviour

Only the timed-out test fails (here `it.fails`, so its file passes); every render file passes.

## Notes

Two workers, so the hot runtime can retire the worker after the leaking file. With one worker Vitest runs every file as one task and the worker cannot be replaced; `pfs-hot-unawaited-act` covers that shape.

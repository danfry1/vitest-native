# Under hot with freshRuntime, every file re-resolves React through the registry

- **Class:** per-file-state
- **Source:** #657 (hotRuntime.freshRuntime): the library-mock cost exhibit's count with the option on
- **Fixed by:** the resolution memo holding absolute requests
- **Needs:** nothing beyond this repository's install

## The bug

With `hotRuntime.freshRuntime`, React and RNTL re-run in every test file. React Native's precompiled registry requires every package outside it by absolute path, once per module that needs it, and the memo of #364 left absolute requests to Node. Each one went through Node's resolver again: 128 `Module._resolveFilename` calls per warm file against 57 with React resident.

## Expected behaviour

The same bound as `pfs-hot-library-mock-cost`, with the option on: a warm file costs fewer than 60 `Module._resolveFilename` calls and 150 `fs.readFileSync` calls.

## Notes

The files are `pfs-hot-library-mock-cost`'s; only `freshRuntime: true` in the config differs. Per-file counts print as `[museum:g3]` lines (MUSEUM_DEBUG=1).

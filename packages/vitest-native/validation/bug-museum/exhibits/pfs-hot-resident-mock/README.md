# Under hot, RNTL keeps a file's partial react-native mock for the worker's life

- **Class:** per-file-state
- **Source:** #670 (Rocket.Chat, cold hot runs only)
- **Fixed by:** #670's fix: a require from a package the hot worker keeps resident is not served a file's mock
- **Needs:** nothing beyond this repository's install

## The bug

A unit test mocks `react-native` with only what its code reads (`{ Platform: { OS: 'android' } }`) and imports one RNTL helper. When that file is the first in a hot worker to load RNTL, RNTL's own `require('react-native')` is answered with the file's mock, and RNTL stays loaded. Every later file in the worker then fails in `fireEvent` with `Cannot read properties of undefined (reading 'flatten')`. In Rocket.Chat it showed only on cold runs, because Vitest orders files differently without its results cache, so a different file loaded RNTL first.

## Expected behaviour

The later file presses its button. The mocking file's own code still sees its mock.

## Notes

Per-file isolation (the control) and `hotRuntime.freshRuntime` load RNTL in every file, as Jest does.

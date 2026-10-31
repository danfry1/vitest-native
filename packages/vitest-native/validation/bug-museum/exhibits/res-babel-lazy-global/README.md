# A cache miss after Expo's runtime is installed compiles with a half-loaded Babel

- **Class:** transform/resolution
- **Source:** Expo SDK 57's winter runtime with a warm transform cache (2026-10)
- **Fixed by:** fix/babel-reentry-winter
- **Needs:** nothing beyond this repository's install

## The bug

The engine installs Expo's winter runtime at setup, as jest-expo does. It replaces `TextDecoder` with a lazy getter that requires expo/src/winter/TextDecoder.ts, which the engine compiles. Babel loads part of itself during its first transform, and @jridgewell/sourcemap-codec reads `TextDecoder` as it loads. On a warm cache a worker's first Babel load is its first cache miss, after the runtime is installed. The getter ran inside Babel's own loading, and TextDecoder.ts was compiled by a Babel still loading. The run failed with "Cannot read properties of undefined (reading 'environmentVisitor')", blamed on whichever file had missed the cache. TextDecoder.ts is compiled only when the getter runs, so it is never cached by the runs that work: once the condition holds it fails every run. A cold run loads Babel before the runtime is installed and passes.

## Expected behaviour

Run 1 fills the cache (it passes either way). In run 2, every file but the test's fresh module is served from the cache: that module compiles, and its export is read.

## Notes

The stand-in Expo touches no other global as it installs. Expo's own reads `FormData`, which initialises Node's fetch, which reads `TextDecoder`, so the getter has already run by the end of setup unless Node's fetch was initialised earlier in the worker.

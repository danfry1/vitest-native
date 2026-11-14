---
"vitest-native": minor
---

**Reanimated's `useAnimatedStyle`, `useAnimatedProps` and `useAnimatedReaction` now run as Reanimated's mappers do, without a render.** A style read after `progress.set()` is current, and reactions run. Existing tests can change:

- A reaction that calls `setState` after a `set()` made outside `act` now logs "not wrapped in act(...)", which fails suites that fail on console errors. Wrap the write in `act`, or use `fireEvent`.
- Updaters rerun on each write, so call counts change, and one that throws throws at the write.
- Styles merge, as in Reanimated: an updater that returns `{ opacity: 1 }` and then `{ display: 'none' }` leaves both keys.

Update tests that relied on render-only behaviour; see [Reanimated's animated hooks](https://vitest-native.danfry.dev/guide/presets#reanimated-s-animated-hooks).

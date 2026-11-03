---
"vitest-native": minor
---

**Reanimated's `interpolate`, `interpolateColor` and `clamp` return real values, and its scroll and event hooks run their handlers.** Snapshots of interpolated styles may change: `interpolate` returned the first output value (with Reanimated 4.7's own mock, `undefined`), and like Reanimated it now throws for ranges shorter than two values.

- Reanimated 4.7's own mock answers those helpers with a no-op, never runs `useAnimatedScrollHandler` or `useComposedEventHandler` handlers, and returns `{ value: 0 }` from `useScrollOffset`. The engine replaces only what the installed mock still gets wrong, so a later Reanimated whose mock does better keeps its own.
- A `useAnimatedScrollHandler` handler passed to `Animated.ScrollView` or `Animated.FlatList` gets `onScroll`, `onBeginDrag`, `onEndDrag`, `onMomentumBegin` and `onMomentumEnd`, with a context kept between events.
- Shared values have `addListener` and `removeListener`. Gesture Handler 3 listens to a shared value passed as gesture config, and without them a run failed with uncaught "`sharedValue.addListener` is not a function" errors though every test passed.
- With Reanimated 3.17 to 4.6, the hand-written preset gains the same helpers and handlers, plus `isSharedValue`, `useComposedEventHandler`, `useScrollOffset` and `useScrollViewOffset`, which Gesture Handler 3 calls.
- Under the mock engine, `interpolate` and `clamp` are Reanimated's own from 4.5; `interpolateColor` throws an error saying it works under the native engine.

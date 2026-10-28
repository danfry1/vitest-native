---
"vitest-native": minor
---

The reanimated preset's `interpolate`, `interpolateColor` and `clamp` are now Reanimated's own, loaded from the installed package, and its scroll and event hooks run their handlers. Assertions and snapshots of interpolated styles may change: `interpolate` returned the first output value (or, with Reanimated 4.7 and later, `undefined`), and now returns the interpolated value; like Reanimated, it throws for input and output ranges shorter than two values.

Under the native engine with Reanimated 4.7 or later, the module is Reanimated's own mock. That mock answers `interpolate`, `interpolateColor` and `clamp` with a no-op, its `useAnimatedScrollHandler` and `useComposedEventHandler` never run their handlers, and its `useScrollOffset` and `useScrollViewOffset` return `{ value: 0 }`, which is not a shared value. The preset replaces those names, and only while the installed mock still behaves so; a Reanimated whose mock does better keeps its own. Now:

- `interpolate`, `interpolateColor` and `clamp` are Reanimated's own, named and on the default export.
- The handler `useAnimatedScrollHandler` returns is one function for the life of the component, as Reanimated's is, and runs the latest render's handlers. Passed to `Animated.ScrollView` or `Animated.FlatList` as `onScroll`, it gets each event's payload and a context kept between events: `onScroll` for scroll events, and `onBeginDrag`, `onEndDrag`, `onMomentumBegin` and `onMomentumEnd` for the drag and momentum events, as Reanimated's scroll views pass them. A scroll view's own `onScrollBeginDrag` and the like still run.
- `useComposedEventHandler` passes each event to every handler it was given.
- `useScrollOffset` and `useScrollViewOffset` return a shared value, the mock's `useSharedValue(0)`.

With Reanimated 3.17 to 4.6 under the native engine, the hand-written preset serves. Its `interpolate`, `interpolateColor` and `clamp` are Reanimated's own there too, on the default export as well, and it gains `isSharedValue`, `useComposedEventHandler`, `useScrollOffset` and `useScrollViewOffset` and the same scroll handler. react-native-gesture-handler 3's hooks and its `ScrollView` call `isSharedValue` and `useComposedEventHandler`, which the preset lacked, so they threw "is not a function". Before 4.5, `interpolateColor.js` imports Reanimated's core, whose loading initializes Reanimated and fails outside the app; the preset loads that file without those two imports, which serve only `useInterpolateConfig`. The preset does not provide `css`: Reanimated 4.7's own mock does.

Under the mock engine, which runs no transform, `interpolate` and `clamp` are Reanimated's own from 4.5. Before 4.5, `interpolate` keeps its stand-in and `clamp` throws, and for every version `interpolateColor` throws an error that says why and that it works under the native engine.

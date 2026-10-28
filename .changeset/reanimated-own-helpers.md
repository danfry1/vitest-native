---
"vitest-native": patch
---

The reanimated preset's `interpolate`, `interpolateColor` and `clamp` are now Reanimated's own, from the installed package, and its `useAnimatedScrollHandler` runs its handler on the scroll events of the scroll view it is passed to, with the event's payload and a context kept between events. Reanimated's own mock, which the native engine serves with Reanimated 4.7 or later, answers all of these with a no-op, so every interpolated value was `undefined` and a component that reacts to scrolling did not react; the rest of that mock is unchanged. `useComposedEventHandler` passes each event to every handler it was given.

With an older Reanimated, and under the mock engine, the preset's `interpolate` returned the first output value, and it had no `isSharedValue` or `useComposedEventHandler`, which react-native-gesture-handler 3's hooks and its `ScrollView` call, so those threw "is not a function". It now has both. Its `interpolateColor` is Reanimated's own under the native engine; under the mock engine, which cannot load it, it throws an error saying so.

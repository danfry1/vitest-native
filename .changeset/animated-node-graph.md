---
"vitest-native": minor
---

The mock engine's Animated is now a live node graph, matching real React Native's semantics (previously it was a snapshot system — the largest known fidelity gap, and the class real-app bake-offs had to monkeypatch around).

- **Derived nodes are live.** `interpolate()` (numeric AND string), `add`/`subtract`/`multiply`/`divide`/`modulo`, and `diffClamp` recompute from their sources on every read and re-notify listeners when any source moves. Numeric interpolations chain; derived nodes are valid operands (previously coerced to 0); chaining off a string interpolation still throws like RN.
- **Animated components re-render.** `Animated.View`/`Text`/`Image`/`ScrollView`/`FlatList`/`SectionList` and `createAnimatedComponent` wrappers subscribe to every node in their style — a `setValue()` or `timing().start()` after render updates the rendered style, so `toHaveStyle` assertions see current values. Gated against real React Native by three new crosscheck probes (post-render `setValue`, live interpolation, live transform) — the corpus is now 78/78.
- **Offsets are real.** `setOffset`/`flattenOffset`/`extractOffset` implement RN's semantics (the canonical PanResponder drag pattern) on `Value` and `ValueXY`; `ValueXY.addListener` now reports the joint `{x, y}` value.
- **`__getValue()` exists on plain values** (RN's own tests call it), and `AnimatedValueXY`/`AnimatedColor` gained `__getValue`/`getValue` parity.
- **`useAnimatedValue`/`useAnimatedValueXY`/`useAnimatedColor` are real hooks**: the value is `useRef`-memoized and survives re-renders (previously every render minted a fresh node, silently resetting animation state — and rebuilt the entire Animated namespace to do it). Consequently they must now be called inside a component, exactly like on-device.

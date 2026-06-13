---
"vitest-native": patch
---

Fix two `Animated` mock fidelity gaps surfaced by the mock-vs-real-RN cross-check:

- `Animated.Text` (and the other `Animated.*` components) now render the base host
  component (`Text`, `View`, …) instead of a host literally named `Animated.Text`,
  so RNTL's `getByText`/`queryByText` can find their text children — matching real
  React Native.
- An `Animated.Value` (or interpolation/color node) used in a `style` prop now
  resolves to its current value on the host's style, so assertions like
  `toHaveStyle({ opacity: 0.3 })` against `new Animated.Value(0.3)` pass — matching
  how real React Native writes the live value onto the host.

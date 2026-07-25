---
"vitest-native": patch
---

`toHaveAnimatedStyle` and `toHaveAnimatedProps` now throw for a value that is not a rendered element

Both matchers returned `{ pass: false }` when handed something without a `props`
object. Under `.not` that result is inverted, so
`expect(null).not.toHaveAnimatedStyle({ opacity: 1 })` passed — a query that matched
nothing, or a value of the wrong shape, produced a green assertion.

They now throw with the same message, which `.not` cannot invert. This matches React
Native Testing Library, whose `checkHostElement` raises for the same case rather than
failing softly.

The positive form still fails as before; only the negative form changes, from
silently passing to reporting the wrong receiver.

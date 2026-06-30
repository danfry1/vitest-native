---
"vitest-native": patch
---

Fix two `mock` engine divergences from real React Native, found by the behavioral cross-check:

- `Pressable` now resolves function `style` and `children` (`({ pressed }) => …`) against its press state, matching real RN's resting render and updating while pressed. Previously the functions were passed through untouched, so the style was never applied and function children never rendered.
- `processColor()` returns `undefined` for an unparseable color (matching real RN's normalizer) instead of coercing to opaque black.

Also publishes the cross-check as a generated, drift-guarded fidelity report — a live badge and a docs page listing the full corpus and what is deliberately left ungated — and expands the corpus to 75 probes.

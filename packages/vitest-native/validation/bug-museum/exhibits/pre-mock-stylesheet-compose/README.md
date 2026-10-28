# The mock engine's StyleSheet.compose/flatten diverge from React Native

- **Class:** presets
- **Source:** verification-harness audit 2026-10-28 (a mutation survived the crosscheck)
- **Fixed by:** local branch fix/mock-stylesheet-compose (no PR yet) (`fix/mock-stylesheet-compose`)
- **Needs:** nothing beyond this repository's install

## The bug

React Native's `StyleSheet.compose(a, b)` returns the other side when one is nullish (`compose(null, b) === b`), and `flatten([])` is `{}`. The mock engine returned `[null, b]` and a different empty value, so snapshots and style assertions disagreed with real RN; the crosscheck probe could not see it.

## Expected behaviour

Under `engine: 'mock'`, compose with a nullish side returns the other side unchanged, and flatten([]) deep-equals {}.

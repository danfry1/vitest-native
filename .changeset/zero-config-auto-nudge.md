---
"vitest-native": minor
---

Add capability-based engine detection and a native-engine nudge. `engine: 'auto'` (the
default) still resolves to `mock` this release — **no behavior change for existing
projects** — but when `@react-native/babel-preset` is installed it now prints a one-line
hint recommending `engine: 'native'` for real-RN fidelity. Explicit `engine: 'native'` and
`engine: 'mock'` are unchanged. `auto` will default to `native` (when available) in v1.

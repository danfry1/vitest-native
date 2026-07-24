---
"vitest-native": minor
---

Precompile React Native's require graph so isolated test files stop paying to re-load it

The native engine runs React Native's real JavaScript, and with isolation on — the
default — that graph was re-instantiated for every test file: roughly 440 separate
Node module loads each time, one per RN source file. Measured on RN 0.86, that cost
~59ms for a typical test's slice of React Native and ~110ms for the full public API,
per file.

React Native's graph is now walked once per (RN version × platform × Babel
toolchain) and emitted as a single file of lazy per-module factories with every
require target resolved ahead of time. A test file pays one read and one compile
instead of ~440. The registry is built in the Vite process, so the cost is paid once
per run, and it is cached under `node_modules/.cache/vitest-native` keyed by a
manifest of the files it was built from — a reinstalled or patched React Native
rebuilds it rather than serving stale code.

Measured on this repository's native suite: aggregate import time 8.8s → 1.9s
(4.6×), wall clock 1.81s → 1.05s.

Semantics are unchanged by design. Module identity is preserved, so React Native's
singletons behave exactly as before and a deep `react-native/Libraries/...` require
from an ecosystem package resolves to the same instance the app sees. Laziness is
preserved, so a test that touches `View` and `StyleSheet` still does not execute the
rest of React Native. Anything the registry cannot serve — a computed require, a
module outside the entry graph, a package listed in `transform` — falls through to
the per-file loader hooks, and a registry that cannot be built leaves the engine
running exactly as it did before.

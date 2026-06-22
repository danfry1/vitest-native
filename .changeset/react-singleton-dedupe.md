---
"vitest-native": patch
---

Deduplicate React across the externalized React Native graph under the native engine.

React Native is externalized and loaded through Node, outside Vite's module graph, so Vite's `resolve.dedupe` does not reach it. When a project resolves more than one physical copy of `react` — common with pnpm/Bun strict stores, monorepos, or version skew — React Native could bind a different React instance than the test renderer, making every render fail with "Invalid hook call". Resolution of `react`, `react-is`, and `scheduler` requested from the externalized graph is now pinned to the project's canonical copy, matching the single-instance guarantee `resolve.dedupe` provides for the Vite graph. A `pm-matrix` harness reproduces the scenario across npm, pnpm, and Bun.

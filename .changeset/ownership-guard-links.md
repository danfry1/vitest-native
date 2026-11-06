---
"vitest-native": patch
---

**The warning for a file that both Vite and Node load, its end-of-run summary and `vitest-native doctor` now link pages users can open.** They pointed at `docs/` files the package does not ship. They now link the published error reference (`/guide/errors#SOURCE_EVALUATED_TWICE`) and the `experimental` options section. The error reference also notes that an installed package's TypeScript source, both required and imported by a test, is loaded twice with no fix available yet (#544). No action needed.

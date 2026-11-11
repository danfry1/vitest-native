---
"vitest-native": patch
---

**`vitest-native doctor` no longer reports `does not import vitest-native` for a config that builds on a shared module through a relative import**, such as a monorepo package's config merging `../../vitest.shared.ts`. doctor follows the config's relative imports up to three levels deep and reports the module that calls `reactNative()`. When it can't settle the question (an import that doesn't resolve, or a deeper chain), it says it couldn't confirm. No action needed.

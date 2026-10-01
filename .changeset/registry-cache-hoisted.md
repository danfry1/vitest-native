---
"vitest-native": patch
---

Fix React Native 0.87 failing to load in a project with no `node_modules` of its own

A project whose dependencies are hoisted to a parent directory — a monorepo package, or a Vitest
project rooted in a subdirectory — had its precompiled React Native registry cached in the OS
temp directory. Code in that registry resolved React Native's deep self-imports from the cache
file's location, which cannot see the install, and failed with "Cannot find module
'react-native/src/private/…'". The cache now lives under the nearest `node_modules` at or above
the project, and resolution from the registry's own code starts at the project, so a cache in the
temp directory (a read-only `node_modules`) works too.

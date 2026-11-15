# 0006-c. Key the transform cache on babel-jest's inputs plus the source path, .env files and React Native extras

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: the key covers content, path, platform, Babel config and options, preset and Babel versions and the ES-module interop revision; the `.env*` hash, a registry-wide interop version and the `transformCacheKey` hook are absent.
- **Enforced by:** `packages/vitest-native/tests/cache-key-ledger.test.ts`, `packages/vitest-native/tests/transform-cache.test.ts`, `packages/vitest-native/tests/registry-key.test.ts`, `packages/vitest-native/tests/transform-project-babel-config.test.ts`
- **Related:** [0006-a](0006-a-compile-verdict.md)

## Decision

The key is babel-jest's recipe (content, root-relative source path, `loadPartialConfig`
options, config-file contents, `NODE_ENV`, `BABEL_ENV`, transformer version) plus a hash of
the project root's `.env*` files, the React Native extras (platform, `EXPO_OS`, boundary
digest, interop version, parameter-injection id) and the resolved plugin and preset versions,
resolved once per config. These are the declared inputs; anything else a plugin reads is
unsupported unless declared through a `transformCacheKey` hook or opted out of caching.
`api.cache.never()` configs are not disk-cached, and the banner says so. A cache-key ledger
test mutates each declared input and requires the key to change.

## Context

Four registry-key inputs and two transform-directory inputs had no test; a Flow-enum fix
shipped invisible to every warm cache until the cache version was bumped. babel-jest's key
misses `.env*` files that react-native-dotenv reads and direct `process.env` reads by inlining
plugins. Plugins such as module-resolver, the reanimated worklet plugin and istanbul produce
path-dependent output, so the path stays in the key.

## Consequences

- **Gains:** `.env` changes stop serving stale output; each declared input is proven.
- **Costs:** one recompile per new key input.
- **Limits:** inputs outside the declared contract are documented gaps; one command clears the
  cache.

## Alternatives rejected

- babel-jest's key exactly: serves stale `.env` output silently.
- A content-only key: serves one file's output for an identical file at another path.
- Key every file on the whole environment: every CI run would start cold.
- Instrument the Babel config to find env reads: risky, and still misses file reads.

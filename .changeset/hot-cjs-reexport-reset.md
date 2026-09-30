---
"vitest-native": patch
---

Preserve CommonJS re-exports across hot worker file boundaries

Hot cleanup now invalidates stale Node relative-resolution lookups after deleting
per-file CommonJS cache entries. This prevents later ESM imports of direct CJS
re-exports from silently receiving empty exports on affected Node versions.

The compatibility layer preserves named exports, cycles, retry behavior and fresh
module identities. It does not evaluate user modules during cleanup; incompatible
loader behavior fails with an actionable worker-isolation fallback. Runtime
defaults are unchanged. The Node upstream fix remains the long-term replacement
for this internal-loader compatibility layer.

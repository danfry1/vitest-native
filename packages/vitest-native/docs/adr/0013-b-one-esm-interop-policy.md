# 0013-b. Use one interop policy, decided when the default is read, for ES modules compiled to CommonJS

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/esm-import-interop.test.ts`, `packages/vitest-native/tests/cache-key-ledger.test.ts`, `packages/vitest-native/validation/bug-museum/exhibits/res-esm-default-interop`, `packages/vitest-native/validation/bug-museum/exhibits/res-esm-default-and-named`, `packages/vitest-native/validation/bug-museum/exhibits/res-esm-namespace-default`, `packages/vitest-native/validation/bug-museum/exhibits/res-esm-cycle-default`, `packages/vitest-native/validation/bug-museum/exhibits/res-esm-proxy-default`
- **Related:** [0013-a](0013-a-per-file-esm-generation.md)

## Decision

Every ES-module-goal file the native engine compiles to CommonJS gets one interop rule
(`src/native/esm-interop.mjs`): keep Babel's default where the target has one, otherwise
give `module.exports`, and decide when `default` is read, not when the module is
required. The rule's revision (`ESM_INTEROP_RUNTIME`) is part of the compile-cache key.

## Context

An ES module compiled to CommonJS that imports a CommonJS file with `__esModule` and no
`default` got `undefined` under Babel's interop, where Node gives `module.exports`
(#339). The first fix decided once, at require time, with `hasOwnProperty`. That broke
import cycles (the default is set after the cycle returns) and Proxy-served modules (the
`get` trap answers `default`, `hasOwnProperty` does not see it).

The rule covers both Babel helpers: a default import and `export { default } from`, and
a default import beside named ones and `import * as ns`. Compiled ES modules carry a
mark so they keep Babel's interop unchanged. The five `res-esm-*` exhibits run in the
bug-museum workflow, which is advisory, not a required check.

## Consequences

- **Gains:** one place decides interop; the forms that broke are guarded by exhibits.
  Changing the rule invalidates cached output, because its revision is in the key.
- **Costs:** a small runtime shared on `globalThis` by every compiled file.
- **Limits:** in a cycle, a default read at top level while the target is still
  half-initialised gets `module.exports`, where Babel gave `undefined`.

## Alternatives rejected

- Decide at require time: wrong forever for a module required mid-cycle, and wrong for
  Proxy-served modules.
- Choose interop per import by resolving the target at compile time: the output would
  depend on other packages' manifests, which the content-keyed cache does not see.
- A Proxy as the namespace: a trap on every member access, and one namespace per file.

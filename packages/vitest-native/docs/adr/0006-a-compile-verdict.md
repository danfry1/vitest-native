# 0006-a. Compile an installed file only when it fails to parse as a CommonJS script

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: selected packages are checked with a `vm.Script` parse before evaluation, and a file that parses goes to Node's loader; the check is not cached by content hash, and files in `type: module` packages always compile.
- **Enforced by:** `packages/vitest-native/tests/needs-transform.test.ts`
- **Related:** [0006-b](0006-b-flow-capable-always-compile.md) (the exceptions), [0006-c](0006-c-transform-cache-key.md)

## Decision

Before evaluating a candidate file, the engine parses it as a CommonJS script, once per file
and cached by content hash. If it parses, Node's own loader runs it, so Node's compile cache
still applies; if the parse throws a `SyntaxError`, the file is transformed. A `SyntaxError`
during evaluation always rethrows. The check starts on today's candidate set; extending it to
every installed file needs its own flag entry.

## Context

"Compile only when Node throws a SyntaxError" stopped working: on Node 22.12+ and 24,
`require(esm)` loads ESM-syntax `.js` files without throwing, and a default import of
Babel-compiled CommonJS then reads `{ default: … }`. This affected 25 entries in obytes,
including all of `@react-navigation/*` `lib/module`, and 3 in Paper. A script parse answers the
question Node is about to ask. It costs 0.051 ms per file cold and 0.009 ms warm.

## Consequences

- **Gains:** fixes the `require(esm)` default-import class; a package Node can already run is
  never handed to Babel.
- **Costs:** a parse per candidate file; on a cold cache this was slightly slower than no check,
  because React Native's own sources need compiling anyway.
- **Limits:** files that parse lose Hermes-oriented downlevelling, which is behaviour-preserving
  on Node.

## Alternatives rejected

- Compile when Node throws a `SyntaxError`: `require(esm)` defeats it.
- Compile through `vm.compileFunction` as "the factory is the compile": it bypasses Node's
  compile cache (67–112 ms against 20–29 ms for TypeScript's 9 MB file).

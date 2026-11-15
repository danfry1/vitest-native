# 0006-d. Prebuild React Native locally into a registry compiled with its own preset

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/registry-key.test.ts`, `packages/vitest-native/tests/registry-compiler-babel.test.ts`, `packages/vitest-native/tests-native/registry-identity.test.ts`
- **Related:** [0006-c](0006-c-transform-cache-key.md) (its key)

## Decision

React Native is compiled locally into a precompiled registry, one per (React Native version,
React version, platform, native-boundary) key, using React Native's Babel preset only. No Oxc
for React Native, Flow, codegen specs, worklet files, or Node-owned workspace files with
project plugins.

## Context

Babel with React Native's preset takes about 1.5 s warm for React Native's 418-file graph, and
Oxc rejects 370 of those 418 files. The precompiled registry cut React Native's full surface
from 110 ms to 21 ms per file.

## Consequences

- **Gains:** React Native loads from one compiled artefact per key.
- **Costs:** a cold build per key.
- **Limits:** a declared deviation: Metro and babel-jest would also apply the project's Babel
  config to React Native; this registry does not.

## Alternatives rejected

- Oxc for React Native: rejects most of its files.
- Transform React Native per file at run time: about five times slower per file.

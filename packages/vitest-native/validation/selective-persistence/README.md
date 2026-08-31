# Selective-persistence architecture experiment

> **Historical branch, not the accepted target.** This proves that a Vitest-hosted
> CommonJS capsule and selective reset can work, but it did not beat the production
> hot runtime and adds another ownership layer. The accepted direction is full Vite
> module/mock reset in a reused worker with React Native remaining Node-owned; see
> `../module-isolation/README.md`.

This directory validates a layered Vitest runtime:

- Vitest schedules one persistent worker (`isolate:false`).
- A custom runner resets the mock registry and every evaluated consumer module before
  each file, preserving only a Vitest-owned React Native actual capsule.
- The capsule hosts the existing lazy CommonJS factory registry, preserving RN cycles
  and singleton identity while root/deep ESM facades and CJS bridges return the same
  objects.
- Native ecosystem modules stay in Vitest's normal graph, use Metro-style resolution
  and the consumer's RN Babel preset, and contribute discovered deep RN entrypoints.
- Expo Router literal route roots are registered synchronously as Vitest-owned route
  modules; Expo's mutated global descriptors are restored between files.

## Commands

From `packages/vitest-native`:

```sh
node ../../node_modules/vitest/vitest.mjs run \
  --config validation/selective-persistence/vitest.contract.mts

node ../../node_modules/vitest/vitest.mjs run \
  --config validation/selective-persistence/vitest.idiomatic.mts

node validation/selective-persistence/run-version-matrix.mjs \
  bare current-rn expo expo-router

node validation/selective-persistence/measure.mjs \
  validation/selective-persistence/vitest.scale.mts 3
```

The installed matrix creates temporary consumer copies and runs npm installs, so it
needs network access. Set `VN_KEEP_SELECTIVE_MATRIX=1` only when inspecting a failing
fixture; successful/default runs clean their temporary root.

The generic selective-persistence reproduction and negative control live in
`upstream-vitest/`. They are retained as later research, not the upstream v1 ask.

## Current result

- 7/7 root/deep/CJS/ESM/mock contracts.
- 21/21 idiomatic tests at one and two workers.
- 135/135 scale tests.
- RN 0.83/RNTL 12/Vite 6, RN 0.86/RNTL 13/Vite 8, and local RN 0.87/RNTL 14.
- Expo 56 packages and Expo Router file-system routes, including a mocked route
  dependency followed by an unmocked file.

The prototype is not production-ready. It uses private Vitest reset state, literal
Router-root discovery, a build-output bridge to the internal ecosystem detector and
package-specific interop adapters. It is also slower and uses more memory than the
current two-worker hot runtime. See `docs/runtime-architecture-bakeoff.md` for the
decision and promotion gates.

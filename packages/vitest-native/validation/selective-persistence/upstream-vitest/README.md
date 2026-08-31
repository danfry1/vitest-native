# Vitest selective module isolation evidence

> **Architecture note (2026-08-30):** this remains a valid generic experiment, but
> selective persistence is no longer the upstream v1 request or the React Native
> target. The smaller primitive is full Vite module/mock isolation inside a reused
> worker (`isolate: "modules"`), with RN remaining Node-owned. See
> `../../module-isolation/README.md` and its retained source patch. Use this directory
> only as evidence for a possible later persistent-actual capability.

This React-Native-free fixture isolates the Vitest primitive needed by the native
runtime: reuse a worker, reset mocks and application modules before every file, and
retain only a successfully evaluated actual module with its coherent dependency
closure.

The fixture deliberately uses private worker state so it runs against unmodified
Vitest releases. `vitest-main-prototype.patch` is the corresponding source-level
implementation against Vitest commit `1c00c94686ff6f96ec756503ed765b31068692a8`.

## Contracts

The gates prove that:

1. a resident actual and its cyclic dependency closure evaluate once per worker;
2. application consumers re-evaluate once per test file;
3. partial mocks are file-local overlays and `importOriginal()` reaches the retained
   actual identity;
4. unmocking reveals that same identity;
5. reset consumers are removed from retained modules' importer sets while internal
   closure edges remain;
6. a rejected selected module is reset and can evaluate successfully in the next
   file;
7. a closure with an invalidated or unevaluated member is reset as a unit;
8. order randomization, two workers and two projects do not change the result.

The negative control removes the selective reset and must fail because a consumer and
the first file's mock leak into later files.

## Release matrix

From `packages/vitest-native`, pass one or more exact Vitest binaries:

```sh
node validation/selective-persistence/upstream-vitest/run-evidence.mjs \
  ../../node_modules/vitest/vitest.mjs \
  /path/to/another/vitest/vitest.mjs
```

For each binary the script runs the base, two-worker, two-project and rejected-import
fixtures, five shuffled seeds, and the expected-failing control. The custom runner is
loaded from the same package as the binary, so the matrix cannot accidentally execute
one Vitest version while reporting another.

## Benchmark

The generated benchmark compares full isolation, selective reset and fully shared
modules. It verifies consumer re-evaluation in both isolated modes and samples peak
RSS across the entire process tree.

```sh
# Released Vitest through the private-runner reproduction
node validation/selective-persistence/upstream-vitest/benchmark.mjs \
  ../../node_modules/vitest/vitest.mjs 100,500 3 runner

# Patched Vitest source build through the proposed config path
node validation/selective-persistence/upstream-vitest/benchmark.mjs \
  /path/to/vitest/packages/vitest/vitest.mjs 100,500 3 module-isolation
```

`BENCHMARKS.md` records the current observations. They are engineering evidence, not
marketing claims.

## Boundary

This is module isolation inside a shared worker, not full realm isolation with one
exception. A JavaScript object cannot retain identity across worker or VM replacement.
Globals, environment mutations, timers and native-library singletons therefore need
explicit reset/restore policy from the integration using this primitive.

A retained module also captures the actual dependencies it evaluated with. Modules
whose dependency mocks are expected to vary between files must remain resettable.
The current React Native design does not retain a Vitest actual capsule. It leaves RN
in the Node-owned CommonJS registry and resets the entire Vite graph. A future,
non-RN integration may still justify this selective-closure contract.

See `PROPOSAL.md` for the upstream API choices, source-test results and recommended
contribution sequence.

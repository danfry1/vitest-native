---
"vitest-native": patch
---

Reset externalized packages a test file imports, under the hot runtime

The hot runtime keeps a worker alive across test files and clears what each file
loaded, so the next one starts fresh. That reset could only reach Node's CommonJS
cache. A package reached through ESM `import` is held by Node's ESM registry, which
has no invalidation API, so its module-level state — a store, a client, a cache —
survived for the whole run. The second test file to touch such a package saw the
first one's writes.

The registry cannot be invalidated, but it is keyed by full URL, and the engine owns
the resolve hook. The per-file reset now advances a generation counter that the
loader stamps onto the resolved URL, so the next file imports a URL Node has not seen
and evaluates the module again. React Native itself and the identity-sensitive
modules already listed in the reset are exempt: for those a fresh instance is the
bug, not the fix. Cost is bounded by ownership — a CommonJS package re-enters through
`Module._cache`, which the reset already drops, so only a namespace wrapper is
retained per generation.

Correctness on a 135-file suite went from 126/135 to 135/135 against the same suite
under stock isolation.

The cost is re-execution, and it scales with how many externalized packages a test
file imports — which is nothing to do with React Native, since RN and the packages
that depend on it are inlined into Vite's graph and never reach this path. A suite
where every file imports eight ordinary npm packages measured 1.14s to 1.77s, 55%
more wall clock; stock isolation runs the same suite in 15.90s, so hot goes from
13.9× to 9.0×. Suites that import few externalized packages pay close to nothing.

Peak RSS does not grow: 946 MB with the stamp against 955 MB without, on that same
suite. A CommonJS package re-enters through `Module._cache`, which the reset already
drops, so only a namespace wrapper is retained per generation.

`hotRuntime: { esmGeneration: false }` trades the correctness back for the speed.
Nothing changes when the hot runtime is off; the counter is only installed by the hot
worker.

The hot-isolation suite reached this fixture through `require` deliberately, because
the ESM path could not pass — it documented the hole rather than covering it. It now
has an ESM twin, and the scale validation gained templates for the shapes that were
missing from it entirely: real React Navigation, a navigation container wrapping a
Modal, and a node_modules package holding module-level state. Navigation had never
run under the hot runtime in any gate.

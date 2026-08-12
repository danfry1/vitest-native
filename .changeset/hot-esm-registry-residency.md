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

Measured on a 135-file suite: correctness went from 126/135 to 135/135 against the
same suite under stock isolation, wall clock was unchanged (9.9× stock isolation),
and peak RSS rose 7.4% (956 MB to 1027 MB). `VITEST_NATIVE_HOT_ESM_GEN=0` restores
the previous behaviour.

Nothing changes when the hot runtime is off; the counter is only installed by the hot
worker.

The hot-isolation suite reached this fixture through `require` deliberately, because
the ESM path could not pass — it documented the hole rather than covering it. It now
has an ESM twin, and the scale validation gained templates for the shapes that were
missing from it entirely: real React Navigation, a navigation container wrapping a
Modal, and a node_modules package holding module-level state. Navigation had never
run under the hot runtime in any gate.

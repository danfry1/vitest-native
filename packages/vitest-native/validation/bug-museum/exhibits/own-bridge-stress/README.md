# The require bridge under load

- **Class:** ownership
- **Source:** ownership track A3 (the require bridge), under load
- **Fixed by:** open (ownership track A3, under `experimental.ownershipModel: 'resolution'`)
- **Needs:** nothing beyond this repository's install

## The bug

A React Native workspace library (Node loads it) requires project source before the test
imports it. Sixteen test files each do this for their own 24-module slice of a generated
graph (`graph.ts`, run as global setup), with four workers under the hot runtime. On main,
Node compiles its own copy of every slice, so the test's import gets a second instance.

## Expected behaviour

Every file gets one instance of its slice and of the store the slices share, and Node's
module cache holds no copy of its own. Under `'resolution'` the bridge evaluates each
slice in Vite and hands Node the same instances, while the other workers' files do the
same in the main process at once. (The bridge's counters are not read here: under the hot
runtime they are test-phase globals, which the per-file reset removes after a worker's
first file.)

A bridge that stops answering must fail this exhibit, never pass it or hang the run: the
bridge's own fetch deadline fails the file, and the exhibit's `timeoutMs` (120 s) ends a
run that hangs anyway.

## Control

None: the bug's precondition is the require that comes first, which is the shape being
loaded.

# Under the hot runtime, a Node-owned workspace library keeps the previous file's store

- **Class:** ownership
- **Source:** ownership track A3 mechanism spike (2026-11-04, Risks: hot runtime); it reproduces on main without the spike
- **Fixed by:** open (ownership track A3)
- **Needs:** nothing beyond this repository's install

## The bug

Two files run in one hot worker, `a` before `b`. `a` imports the React Native workspace
library `@m/feature` first. Node owns it (it peers on react-native), and it imports the
store from a second workspace package. `b` imports the store first and the library second,
the order #371 handles: Node's `require` of the store gets Vite's instance.

The hot runtime gives `b` a fresh Vite module graph, so `b` evaluates a new store. Node's
copy of the library is not evaluated again, so it still holds the store it bound during
`a`. The value `b` writes never reaches the library. Silent: no error, wrong values.

With the hot runtime off, each file gets a fresh world and `b` passes, as
`own-alias-string` does.

## Expected behaviour

Each test file sees one store, whatever ran earlier in the worker: Node-owned modules that
import Vite-owned ones are reset per file under the hot runtime, or are evaluated per
file.

## Control

`hotRuntime: false`: no state carries from `a` to `b`.

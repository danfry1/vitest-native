# Under the hot runtime, a Node-owned workspace library keeps the first file's ES module instance

- **Class:** ownership
- **Source:** ownership track A3 mechanism spike and its review (2026-11-04)
- **Fixed by:** #447 (draft, `fix/hot-rule7-esm-residency`)
- **Needs:** nothing beyond this repository's install

## The bug

Two files run in one hot worker, `a` before `b`. Both import the store before the React
Native workspace library `@m/feature`, the order #371 handles: Node owns the library (it
peers on react-native), and its import of the store gets Vite's instance. `a` passes.

The hot runtime gives `b` a fresh Vite module graph, so `b` evaluates a new store and a new
`Box`. Node's ES module registry still holds the library's module from `a`: the loader
stamps a per-file version only on files under node_modules, so a workspace source file
keeps one URL and is never evaluated again. The library builds `a`'s `Box`, and `b`'s
`instanceof Box` is false. Silent until something checks identity.

With the hot runtime off, each file gets a fresh world and both pass. `b` alone under the
hot runtime passes too: the bug needs an earlier file in the same worker.

## Expected behaviour

Each test file sees one module instance of the store, whatever ran earlier in the worker.

## Control

`hotRuntime: false`: no module carries from `a` to `b`.

# Under hot, a non-configurable global fails every later file in the worker

- **Class:** per-file-state
- **Source:** #773 (an app's suite reaching the openai SDK, 2026-11-11)
- **Fixed by:** a property no reset can remove joins the worker's baseline
- **Needs:** nothing beyond this repository's install

## The bug

A library registers itself once per process with `Object.defineProperty(globalThis, key, { configurable: false })`. The openai SDK does this for its provider definitions.

Before each file, the hot reset deleted every global the previous file added. It could not delete this one, so it threw "hotRuntime state restoration failed". It threw again before every later file, so every file after the first in that worker failed to load. Files b to e fail; a, the first, passes.

## Expected behaviour

Every file loads and passes. A non-configurable property can't be removed, so it is worker state, as Node's own process-wide registries are. The reset keeps it and still deletes every configurable global a file adds.

## Notes

Per-file isolation (the control) starts every file in a fresh worker, so each file defines the property on a clean global object.

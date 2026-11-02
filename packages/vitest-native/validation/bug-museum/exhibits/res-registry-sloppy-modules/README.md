# The precompiled registry runs React Native's sloppy modules in strict mode

- **Class:** transform/resolution
- **Source:** registry fidelity review (2026-10)
- **Fixed by:** open (fix/registry-module-strictness)
- **Needs:** nothing beyond this repository's install

## The bug

React Native's Babel preset compiles with `strictMode: false`, so most of its modules (334 of 440 in RN 0.88's registry graph) carry no "use strict", and Node and Jest run them sloppy. The precompiled registry opened its file with "use strict", which made every inlined module strict: a write to a frozen object threw a TypeError instead of failing silently, and `this` in a plain call was undefined instead of the global object. The same test passed under Jest, and under vitest-native with `VITEST_NATIVE_NO_REGISTRY=1`.

## Expected behaviour

Platform's `constants` getter, called on a frozen object that inherits from Platform, returns null without throwing, as under Jest.

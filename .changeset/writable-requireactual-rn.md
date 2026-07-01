---
"vitest-native": patch
---

Make `jest.requireActual('react-native')` return a writable facade. Jest suites commonly clone-and-override React Native — `const RN = jest.requireActual('react-native'); RN.Platform = {...}; return RN`. Under the native engine RN's index is a facade of lazy getters with no setters, so assigning to it threw `Cannot set property … which has only a getter` and failed to load the whole test file. `requireActual('react-native')` now returns a write-through proxy: reads fall through to the real (lazy) facade, and assignments are captured so the override wins on later reads — matching Jest's mutable module. Only `react-native` is wrapped; its submodules and other packages are ordinary mutable CommonJS.

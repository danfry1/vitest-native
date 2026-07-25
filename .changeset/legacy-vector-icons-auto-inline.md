---
"vitest-native": patch
---

Stop claiming a preset covers the legacy `react-native-vector-icons` package

The preset auto-detect map listed both `@react-native-vector-icons/common` and the
unscoped `react-native-vector-icons` against the `vectorIcons` preset. That preset
shadows exactly one module — the shared factory the v10+ scoped icon-set packages
are built on. The legacy package predates that split and does not use it, so the
preset had nothing to give it.

A package name in that map means "a preset shadows this, so its real source never
loads", and three things act on it: the package is excluded from React Native
ecosystem auto-inlining, and both `doctor` and `migrate` report it as already
handled. A project on the legacy package therefore had its untranspiled source
neither shadowed nor transformed, which is the parse failure auto-inlining exists to
prevent, while the tooling reported it as covered.

The mapping is removed, so `react-native-vector-icons` is auto-inlined and
transformed like any other React Native ecosystem package. Projects on the scoped
packages are unaffected.

Presets are also now checked against the map: every package name it lists must be
one the named preset actually declares a module for. Only packages installed in this
repository's own test suites exercised that link before, so a mapping that pointed
nowhere could go unnoticed.

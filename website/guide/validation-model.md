# Validation Model

vitest-native separates **package capability evidence** from **external-app observations**. This
prevents custom application setup, Jest-era mocks, dependency pins, or migration shims from being
mistaken for limitations in vitest-native itself.

## Authoritative evidence

Support and fidelity claims must be backed by package-owned, deterministic checks:

1. **Conformance tests** exercise the public plugin, engines, presets, helpers, and compatibility
   APIs in controlled fixtures.
2. **Behavioral crosschecks** run the same probes against the mock engine and real React Native.
3. **Packed consumer tests** install the produced tarball into bare React Native, Expo, monorepo,
   and RNTL-version fixtures.
4. **Version matrices** run the native and hot engines across every claimed React Native and
   supported Vitest combination.
5. **API compatibility checks** resolve the exact React Native installed for the package under
   test and compare its stable runtime exports with the mock registry.

These checks can block a release. When a capability is added or a bug is fixed, the minimal
reproduction belongs in one of these package-owned suites.

## External-app observations

Pinned suites such as react-native-paper and the Obytes template are useful integration tripwires,
but they are not capability tests. Their results include the app, its dependency versions, custom
migration configuration, updated snapshots, Jest-era mocks, fake timers, and library-specific
shims. A changed pass count can come from any part of that combined system.

Therefore an external-app result must never, by itself, be used to conclude that:

- vitest-native regressed;
- a React Native behavior is unsupported;
- a migration is impossible; or
- the mock or native engine is inaccurate.

An external change opens an investigation. The next step is to reduce the behavior into a minimal,
package-owned test. Only that reproduction can establish a package bug or support boundary.

## Claim policy

Public compatibility and fidelity claims come from authoritative checks. External apps may be
described as migration examples or observations only, with their custom setup disclosed. Internal
pass-count baselines are operational signals and are not product metrics.

This hierarchy keeps the core small: new behavior is implemented once, in the package, and proven
with focused contracts instead of accumulating app-specific compatibility code.

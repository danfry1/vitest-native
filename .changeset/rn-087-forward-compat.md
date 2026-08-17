---
"vitest-native": patch
---

Resolve React Native 0.87's gated deep imports, and mock its new AssetRegistry export

React Native 0.87 ships an `exports` map whose deep-import surface sits behind
Metro's `react-native-legacy-deep-imports` condition — and its Babel preset now
compiles RN's own relative imports into bare deep specifiers
(`react-native/src/private/…`), so RN's compiled graph self-references through
paths plain Node refuses with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Under the native
engine that failed almost every suite at collection. The engine now mirrors
Metro: when Node's resolver rejects a `react-native/*` or `@react-native/*` deep
specifier, the file is located by path from the package's real directory,
platform extensions included, in the require hook, the ESM loader, and the
precompiled registry's fall-through — where resolving by path keeps deep files
on the registry's instances instead of loading twins. Inert on 0.86 and earlier,
which have no exports map to reject anything.

The mock engine gains `AssetRegistry` (a top-level export since 0.87),
mirroring `@react-native/assets-registry/registry` down to its 1-based truthy
ids. The compatibility checker no longer misreads the bare `get() {` inside
0.87's new `Object.defineProperty` export blocks as an export named `get`, and
the InteractionManager probe is version-gated: 0.87 removed the API outright,
so the matrix keeps running it on every version that ships it.

React Native 0.87 is not yet in the supported matrix — its release is inside
the dependency cooldown window; adoption follows separately.

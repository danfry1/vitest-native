---
"vitest-native": patch
---

Document the versioning contract, and check it against the build

The package shipped stability *labels* — which surfaces are release-supported, which
are experimental — but never a semver contract: which exports and options are covered,
what a major may break, how the peer ranges may move, and what a deprecation cycle
looks like. `docs/versioning.md` states all of it, and ships with the package.

The document enumerates the public surface, so it is checked rather than trusted.
`tests/versioning-contract.test.ts` loads each documented entry point and asserts the
export lists match exactly in both directions, that the stated preset-factory count is
right, and that the documented plugin options are exactly the keys the validator
accepts. A surface added without a contract update fails the suite, as does a contract
naming something that does not exist.

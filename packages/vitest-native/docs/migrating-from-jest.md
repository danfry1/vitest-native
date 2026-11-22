# Migrating an existing Jest suite to vitest-native

The migration guide is on the documentation site:
**https://vitest-native.danfry.dev/migration/from-jest**

Start with `npx vitest-native migrate`, which reads your Jest config and prints a report and a
suggested config. `migrate --write` saves the config.

Messages from vitest-native 0.14 and earlier link to this file. The page each one means:

| Message | Where to read |
|---|---|
| Snapshots: "the resolveSnapshotPath recipe … section 2d" (`vitest-native compare`) | [Keep Jest's and Vitest's snapshots apart](https://vitest-native.danfry.dev/migration/from-jest#snapshots) |
| A package that "shipped source Node can't run directly" | [Drop jest-preset and transform config](https://vitest-native.danfry.dev/migration/from-jest#drop-jest-preset-and-transform-config) and [untranspiled packages](https://vitest-native.danfry.dev/guide/mocking#packages-that-ship-untranspiled-source) |
| `jest.<api>() has no Vitest equivalent` (`JEST_API_UNSUPPORTED`) | [`JEST_API_UNSUPPORTED`](https://vitest-native.danfry.dev/guide/errors#JEST_API_UNSUPPORTED) and the [jest-compat reference](https://vitest-native.danfry.dev/guide/jest-compat) |

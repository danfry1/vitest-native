---
"vitest-native": patch
---

Make `migrate` reproduce Jest's effective test set and settings, and report Babel plugins

`migrate` translated only an explicit `testMatch`, so a project that took its patterns from a
preset or from Jest's defaults was migrated to Vitest's default include instead. On a jest-expo
app this collected about twice as many files as Jest ran and missed some of Jest's own tests.
The suggested config now uses Jest's effective patterns: the config's `testMatch`, otherwise the
installed preset's (read from it the way Jest loads it), otherwise Jest's defaults for the
installed major. `testPathIgnorePatterns` and `modulePathIgnorePatterns` become `test.exclude`
globs where the regex has an exact glob form (and are reported where it does not), and
extensions missing from `moduleFileExtensions` are excluded, since Jest never sees those files.

Other changes:

- Flags that the `test` script passes to Jest are applied over the config as Jest applies them:
  `--testTimeout`, `--maxWorkers`, `--runInBand` and `--config`. `--bail` is reported rather than
  mapped because Vitest's `bail` counts failed tests, not suites.
- Anchored `moduleNameMapper` keys (`^name$`) become exact `resolve.alias` entries. A mapper that
  points into `node_modules` for a specifier the package's `exports` already serves is dropped.
- `transformIgnorePatterns` allowlists with nested and optional groups are now parsed. Each allowed
  dependency is classified: packages that React Native or a preset handles, packages that are
  detected automatically, and ES-module packages need nothing. Only the remaining packages go into
  `transform`.
- The project's Babel config is read, and its plugins are sorted into required (macro plugins),
  mapped (`module-resolver` aliases become `resolve.alias`), not needed (worklets/reanimated
  plugins, React Compiler) and unknown. `migrate` adds required plugins through
  `@rolldown/plugin-babel` when Vite 8 and that package are installed, and otherwise prints the
  snippet to add. `doctor` warns about the same plugins.
- The CLI no longer claims more than the presets do. The report and `doctor` name the modules the
  expo preset shadows instead of saying Expo modules are covered. A manual `__mocks__` file is
  called redundant only when an active preset shadows that module. Asset mappers are compared with
  the extensions the plugin stubs by default.

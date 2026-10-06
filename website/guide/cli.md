# CLI

vitest-native ships a small CLI for the three moments where a config file and
docs page aren't enough: starting out, checking an environment, and migrating
from Jest.

```bash
npx vitest-native init          # write a ready-to-run vitest config
npx vitest-native doctor        # diagnose peers, engine, presets, RNTL/Node
npx vitest-native migrate       # analyze your jest config → migration report
```

All commands accept `--root <dir>` (default: the current directory).

## `init`

Writes `vitest.config.mts` (or `.mjs` in JS-only projects) with the
zero-config plugin. Refuses to overwrite an existing config unless `--force`.

```bash
npx vitest-native init                 # plain config
npx vitest-native init --jest-compat   # + jest-compat layer, for migrated suites
```

The `--jest-compat` variant is byte-for-byte the config block the
[Jest migration guide](/migration/from-jest) documents: `jestMockTransform()`
after `reactNative()`, `globals: true`, the `@jest/globals` alias, and the
jest-compat setup file.

## `doctor`

Read-only environment diagnosis:

- Node version against the floor (and the RNTL 14 ⇄ Node 22.13 interaction —
  the one incompatibility that otherwise surfaces as a raw runtime failure).
- Required peers (vitest, vite, react) against the supported ranges, including
  the per-major Vite security floors.
- Which engine `auto` resolves to for this project, and why.
- Every auto-detected preset (installed package → preset), and installed
  packages that run their own test mode under Vitest instead (react-native-mmkv 3+).
- Expo presence, and which Expo modules the expo preset shadows.
- Babel plugins from your Babel config that a vitest-native run does not apply
  (warnings only; a macro plugin is reported as required). To read them, doctor
  loads `babel.config.js` / `.babelrc.js` the way Babel would (with
  `NODE_ENV=test`); ESM and TypeScript configs are only scanned as text.
- Whether a vitest config exists and uses vitest-native.

Exits non-zero when it finds a blocking problem, so it can gate CI setup jobs.

## `migrate`

Reads your Jest configuration (`package.json#jest` or
`jest.config.{js,cjs,json}`) and reports, key by key:

- **Mapped automatically** — keys the suggested config absorbs
  (`setupFilesAfterEnv` → `setupFiles`, path aliases → `resolve.alias`,
  `transformIgnorePatterns` allowlists → `reactNative({ transform: [...] })`
  only for packages that ship JSX or Flow in a `.js` file and are not already
  compiled by the engine, `testTimeout`, `clearMocks`, …).
  The test set is Jest's effective one: `testMatch` from your config, else
  from the preset (read from the installed preset), else Jest's defaults,
  narrowed by `testPathIgnorePatterns`, `modulePathIgnorePatterns` and
  `moduleFileExtensions`. Flags the `test` script passes to Jest
  (`--testTimeout`, `--maxWorkers`, `--runInBand`, `--config`) are applied
  the way Jest applies them, over the config.
- **Babel** — plugins from your Babel config that babel-jest applied and
  vitest-native does not, sorted into required, mapped, not needed and unknown
  (see [Babel plugins](/migration/from-jest#babel-plugins-your-jest-run-applied)).
- **Covered by presets — delete** — manual `__mocks__/` files and setup lines
  that the auto-detected presets replace.
- **Needs your attention** — regex module mappers, fake-timer config, unknown
  keys: things a human should decide.
- **Dropped** — Jest keys with no vitest-native equivalent needed.

It ends with a complete suggested config. Dry-run by default; `--write` saves
it (guarded like `init`). It never edits test files — top-level `jest.mock`
calls are handled at runtime by
[`jestMockTransform()`](/guide/jest-compat).

`jest.config.ts` / `.mjs` and function-form configs can't be loaded
automatically; the report says so instead of guessing.

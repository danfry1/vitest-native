# CLI

vitest-native ships a small CLI for the moments where a config file and docs
page aren't enough: starting out, checking an environment, and migrating from
Jest.

```bash
npx vitest-native init          # write a ready-to-run vitest config
npx vitest-native doctor        # diagnose peers, engine, presets, RNTL/Node
npx vitest-native migrate       # analyze your jest config → migration report
npx vitest-native compare       # run the suite under Jest and Vitest, list the differences
```

All commands accept `--root <dir>` (default: the current directory). A flag the command
does not take is refused with the valid ones listed, so a typo such as `--wirte` stops the run
instead of quietly doing something else.

## `init`

Writes `vitest.config.mts` (or `.mjs` in JS-only projects) with the
zero-config plugin. Refuses to overwrite an existing config unless `--force`.

```bash
npx vitest-native init                 # plain config
npx vitest-native init --jest-compat   # + jest-compat layer, for migrated suites
```

The `--jest-compat` variant writes the same pieces the
[Jest migration guide](/migration/from-jest) documents: `jestMockTransform()`
beside `reactNative()`, `globals: true`, the `@jest/globals` alias, and the
jest-compat setup file. It leaves the engine on its default (`auto`), where the
guide's example names `engine: 'native'`.

## `doctor`

Read-only environment diagnosis:

- Node version against the supported range (22.22.3+ on Node 22, 24.12+ on Node 24, or 26+).
- Required peers (vitest, vite, react) against the supported ranges, including
  the per-major Vite security floors.
- Which engine `auto` resolves to for this project, and why.
- Every auto-detected preset (installed package → preset), and installed
  packages that run their own test mode under Vitest instead (react-native-mmkv 3+).
- Expo presence, and how Expo modules run under the engine it resolves to.
- Babel plugins from your Babel config that a vitest-native run does not apply
  (warnings only; a macro plugin is reported as required). To read them, doctor
  loads `babel.config.js` / `.babelrc.js` the way Babel would (with
  `NODE_ENV=test`); ESM and TypeScript configs are only scanned as text.
- Whether a vitest config exists and uses vitest-native.

Exits non-zero when it finds a blocking problem, so it can gate CI setup jobs.

## `migrate`

Reads your Jest configuration (`package.json#jest`, or the first
`jest.config.{js,ts,mjs,mts,cjs,cts,json}` in Jest's own order) and reports, key by key:

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
it, and refuses to overwrite an existing config unless `--force`. It never edits test files — top-level `jest.mock`
calls are handled at runtime by
[`jestMockTransform()`](/guide/jest-compat).

TypeScript configs load through Node's own type stripping (Node 22.18 or later). Jest
loads them through ts-node instead, so a config that relies on it (an extensionless
relative import, an `enum`, a path alias) can't be loaded, and neither can a config that
uses top-level `await` or exports a function. The report then names the file and Node's
reason, instead of guessing.

## `compare`

Runs your project's own Jest, then its own Vitest, and lists every test that passes under Jest and not under Vitest, grouped by its first error. Use it while both runners are in place; see [running Jest and Vitest side by side](/migration/from-jest#side-by-side).

```bash
npx vitest-native compare
npx vitest-native compare --json compare.json   # a report to attach to an issue
```

Neither run writes snapshots, and compare fails if a run changes a file in the project. With no Vitest config yet, it uses the config `migrate` would write, without saving it. It exits 0 when every test that passes under Jest also passes under Vitest and `vitest run` exits 0, 1 when not, and 2 when a runner could not run or the project changed.

| Flag | Does |
|---|---|
| `--jest-args "<args>"`, `--vitest-args "<args>"` | Pass extra arguments to one runner. Only filters, timeouts and switches that cannot write files are accepted. |
| `--vitest-config <file>` | Use this Vitest config. |
| `--jest-results <file>` | Read a Jest `--json` report, such as one from CI, instead of running Jest. |
| `--jest-root <dir>` | The directory that report was made in. Found from the report when omitted. |
| `--json <file>` | Write a report of test names, results and error messages, with stack traces, code frames and absolute paths removed. Read it before you attach it to an issue: a message still contains whatever a test put in it. |
| `--top <n>` | How many error groups and files to list (default 10). |
| `--timeout <seconds>` | The time limit for each runner (default 1800). |
| `--show-output` | Stream both runners' output. |
| `--strict` | Confirm a parametrised test whose title Vitest printed as `%p` only by its title, never by its row position. |

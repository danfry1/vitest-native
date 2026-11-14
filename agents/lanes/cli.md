# Lane: cli

The `vitest-native` command line: `init`, `migrate`, `doctor`, `explain`, `compare`.

**Where to look:** `src/cli/` (`index`, `init`, `migrate`, `doctor`, `compare`, `compare-run`).

## Invariants
- **`migrate` never edits user test files.** (ADR 0017)
- **`doctor` and `explain` read the ProjectContext and the ownership policy**, not ad-hoc env vars. (ADR 0003)
- **`compare` matches a fail→fail pair only on error class plus first-line signature.** (ADR 0002)

## Settled decisions
- There is no codemod that edits user tests.
- There is one Babel mechanism: `projectBabel: 'auto'`.
- `doctor` claims support only for versions that were tested.

## Conventions
- **Refuse unknown flags.** A typo, `--wirte`, once silently ran a dry run.
- **Read each child stream on its own,** with its own `StringDecoder` and line buffer. Never call `chunk.toString()` on piped output you parse.
- **Spawn child Vitest runs with `NO_COLOR=1`** and no `FORCE_COLOR`, and strip ANSI codes. Use `tests-native/support/run-app.ts`.
- **Tests that spawn Vitest go in `*.e2e.test.ts`.**

## Verification
- **Run `migrate`'s output end to end with a red control.** "Declared" uses the engine's seed fields.

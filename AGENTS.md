# vitest-native: guide for agents and contributors

Read this before changing anything, whether you are a person or a coding agent.
Then read the file for the lane your change is in. It is written for any tool.
Tool-specific setup lives in thin adapter files; `CLAUDE.md` only imports this
file.

It follows the [agent workflow standard](https://github.com/danfry1/standards/blob/main/agents.md).
Decisions cited as "ADR NNNN" are recorded in `docs/adr/`.

## How a change is made

- **An issue is the spec, and a pull request is the deliverable.** Nothing
  reaches `main` without a pull request, a green check and a maintainer's
  merge.
- **One issue, one branch, one pull request.** Name the branch
  `<issue>-<slug>`. If you were given an issue to work on, stay inside it.
  Before changing files outside your lane, adding a dependency, or editing a
  hotspot file (below), ask. Improvements you notice along the way become a
  suggestion for a new issue, not part of your diff.
- **Before a pull request is ready:**
  - tests are written first and mutation-checked;
  - `bun run test`, `bun run typecheck`, `bun run lint` and
    `bun run format:check` pass;
  - a changeset is added;
  - someone other than the author has reviewed it, a person or a fresh agent.
    The reviewer checks scope against the issue and names the test that proves
    each acceptance criterion.
- **When you learn something that will stay true,** add it to your lane's
  file in the same pull request.

### Working alone

Everything above applies to a single person or a single agent. Pick an issue,
branch, write the tests first, run the checks, and open a pull request.

### Working as one of several agents

When several agents work at once:

- each works in its own git worktree, on one issue;
- at most one agent works in each lane, and at most three or four work in total;
- changes to the lockfile, root config or CI run on their own.

Report to whoever assigned the work, through the channel they gave you. Keep
each report to one line, and send one only at these points:

```
[<lane>-<issue>] PR #<n> opened · closes #<issue> · check <green|red>
[<lane>-<issue>] QUESTION: <what is unclear> · recommend: <your answer>
[<lane>-<issue>] BLOCKED: <what is stopping you>
[<lane>-<issue>] FOLLOW-UP: <a suggested new issue>
```

## Lanes

`agents/lanes.json` says which lane owns every tracked file.
`tests/agent-lanes.test.ts` fails if any file has no owner.

| Lane | Owns |
| --- | --- |
| [compat](agents/lanes/compat.md) | Jest compatibility, presets, mocks, matchers, and the library-support files in `src/native/` |
| [cli](agents/lanes/cli.md) | `src/cli/` |
| [runtime](agents/lanes/runtime.md) | The rest of `src/native/`, the top-level `src/` modules, and `tests-native/` |
| [evidence](agents/lanes/evidence.md) | `validation/`, `crosscheck/`, `consumer-tests/`, `ecosystem-probe/`, the ratchet files, `/bench/` and `/apps/` |
| [docs](agents/lanes/docs.md) | `/website/` outside the guide pages, `docs/`, the READMEs and the agent guide |
| [delivery](agents/lanes/delivery.md) | CI, scripts, lint rules, manifests, the lockfile and root config |

Paths are relative to `packages/vitest-native/` unless they start with `/`.

**Shared, with no lane:** `tests/`, changesets and `/website/guide/`. A change
adds its own tests, its own changeset, and its own guide page.

**Hotspot files.** Many changes need these, so each has one owner:

- `package.json` and `/bun.lock` belong to **delivery**. Other lanes ask.
- `src/plugin.ts` and `src/types.ts` belong to **runtime**. A new option from
  another lane waits until runtime work in progress has merged.
- `tests/native-unit.test.ts` is shared and large. Add new tests in a separate
  file per module, not to this file.

## Rules for every lane

### Invariants

- **Fail loudly, by name. Never fall back silently.** A file that passes under
  Jest may fail here only through a named limit with a remedy. Error codes live
  in `src/errors.mjs`. (ADR 0008, 0017)
- **One owner per module instance.** The same file evaluated by Vite and by
  Node is two instances. (ADR 0004)
- **Every behaviour change goes behind the flag table** in `src/flags.ts`
  (`{name, adr, since, decideBy}`). At most 2 flags are live, and a flag past
  its `decideBy` date blocks release. Refactors ship without a flag.
  (ADR 0001, 0016)
- **No structural scorecard metric may rise:** patch sites, environment
  switches, private globals and swallowed catches. (ADR 0002;
  `scorecard.json`)
- **Every new public option has an ADR,** and a section in
  `/website/guide/plugin-options.md`. (ADR 0016)

### Settled decisions (ADR 0017; don't reopen them)

- No parallel v2 runtime.
- No Jest-exact "strict" isolation tier beside stock and hot.
- No realm or vm-pool isolation.
- No single Vite graph for React Native.
- No Oxc for React Native, Flow or codegen specs.
- No fetching at run time.
- No Hermes, Fabric or Fantom.
- No react-native-web.
- No codemod that edits user tests.
- No patching of dependencies, or of React or scheduler internals.
- No more than two runtime dependencies.

### Conventions

- **Every addition needs a reason you can name today.** A new file, script,
  option, abstraction or dependency must serve the issue in hand, not a
  possible future. Prefer deep modules with small, typed contracts over many
  thin ones. Logic used in one place lives in that place; a script earns a
  file of its own only when CI or a documented command runs it.
- **Don't reassign members of objects you don't own** (`vi`, `expect`, React
  Native exports). Add to our own `jest` object, and read state from its
  owner. The no-monkey-patching lint rule enforces this.
- **Use closing keywords (`fixes #N`) only for what the pull request itself
  resolves.** For anything else, write "fixed by #N".
- **In a `"type": "module"` package, CommonJS goes in `.cjs` files.**
- **Recorders refuse impossible results,** such as an all-fail baseline or a
  tiny RSS, so bad measurements never become data.
- **Pull request text and changesets are neutral and in the user's
  vocabulary.** Credit outside reporters and contributors with a final
  `Thanks @handle for … (#N).` line.
- **Install nothing new without the maintainer's approval.** Pin an exact
  version that was released at least 7 days ago.
- **Never force-push or rebase a pushed branch.** Merge `origin/main` instead.

### Traps

- **After every merge, compare files blob by blob.** A file that matches the
  branch's pre-merge version but differs from main's is a silent revert. Start
  data files from main and re-apply your change; never "take ours".
- **When `package.json` conflicts,** merge both sides' additions, then check
  that every script it names still exists.
- **Never use `git stash` for mutation checks.** The stash list is shared
  across worktrees. Mutate with `git show origin/main:<path> > <path>`, and
  restore from a copy.
- **Pass shell flags as literals or arrays.** zsh doesn't word-split an
  unquoted variable.
- **Wait on a process or a PID, never on command-line text,** which can match
  your own shell.
- **Never undo a step in a prepared environment with `git checkout` or
  `git reset`.** Throw the copy away instead, and diff `package.json` and the
  lockfile around every install.
- **Long and timed runs need a machine that won't sleep.** On macOS, check
  `pmset -g log` before believing any timeout.

### Verification

- **Mutation-check every new regression test:** turn the fix off, watch the
  test fail, then restore it.
- **Read the `Test Files` line, not only `Tests`.** It must be non-empty and
  show no skipped files.
- **Loops and classifiers count what they actually checked,** and assert a
  minimum.
- **Run gates from inside `packages/vitest-native`, with `set -o pipefail`.**
  Never pipe a gate into `tail`, and make a commit depend on the gate's own
  exit code.
- **Check any new probe or measurement against a known value once** before
  trusting it.
- **Speed claims need repeated runs, medians and the raw output kept.** Count
  resolutions, evaluations and loads first; wall-clock time is only a
  tripwire.

## Commands

Run these from the repository root unless noted.

- `bun install --frozen-lockfile` first, and again after merging `main` into a
  long-lived branch.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run format:check`.
- `bun run test:native` before pushing a change to a served mock or the native
  engine.
- `bun run build` after merges, because the native configs import `dist/`.
- Never use `bunx` or `npx`: they fetch packages, and
  `tests/no-bunx-npx.test.ts` enforces this.
- Don't commit `.vitest/`, `.tmp/` or `coverage/` output.

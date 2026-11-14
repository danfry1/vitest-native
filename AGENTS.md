# vitest-native: agent guide

Read this before changing anything. Then read the file for the lane your work is in (`agents/lanes/<lane>.md`). The workflow follows the agent workflow standard (https://danfry.dev/standards/agents.md).

## Workflow

- An **issue is the spec and a pull request is the deliverable**. Nothing goes to `main` without a PR, a green check and the maintainer's merge.
- A worker handles **one issue, in one worktree, producing one PR**, and is named `<lane>-<issue>` (e.g. `runtime-812`). It ends when its PR merges.
- **Stay inside the brief.** Before you change files outside your lane, add a dependency, or change a hotspot file you don't own (below), send a `QUESTION`. An improvement you notice along the way becomes a `FOLLOW-UP`, not part of your diff.
- **Report to the lead in one line** with `SendMessage` (session name `lead`). Never type into another agent's terminal.
  ```
  [<lane>-<n>] PR #<pr> opened · closes #<n> · check <green|red>
  [<lane>-<n>] QUESTION: <ambiguity> · recommend: <answer>
  [<lane>-<n>] BLOCKED: <what>
  [<lane>-<n>] FOLLOW-UP: <suggested issue>
  ```
- **Before a PR is ready:** tests written first and mutation-checked, the full check clean, and a fresh read-only review. That review checks scope, names the test behind each acceptance criterion, and tries to break the change.
- **When something you learned will stay true**, add it to your lane's file in the same PR.

## Lanes

Paths are relative to `packages/vitest-native/` unless they start with `/`.

| Lane | Paths | Label | Workers at once |
| --- | --- | --- | --- |
| [runtime](agents/lanes/runtime.md) | `src/native/**`, `src/plugin.ts`, `src/types.ts`, `src/setup.ts`, `src/resolve.ts`, `src/cjs-bridge.ts`, `src/fs-module-cache.ts`, `src/serializer.ts`, `src/context.mjs`, `src/node-dispatch.mjs`, `tests-native/**` | `area:runtime` | 1 |
| [compat](agents/lanes/compat.md) | `src/jest-compat/**`, `src/presets/**`, `src/preset-map.ts`, `src/mocks/**`, `src/matchers/**`, `src/rntl-support.mjs` | `area:compat` | 1 |
| [cli](agents/lanes/cli.md) | `src/cli/**` | `area:cli` | 1 |
| [evidence](agents/lanes/evidence.md) | `validation/**`, `crosscheck/**`, `consumer-tests/**`, `ecosystem-probe/**`, `/bench/**` | `area:evidence` | 1 |
| [delivery](agents/lanes/delivery.md) | `/.github/**`, `scripts/**`, `/package.json`, `package.json`, `/bun.lock`, `tsdown.config.ts`, `package-budget.json`, `/.changeset/config.json` | `area:delivery` | 1, never alongside another dependency change |
| [docs](agents/lanes/docs.md) | `/website/**`, `README.md`, `/README.md`, `/CONTRIBUTING.md`, `docs/**` | `area:docs` | 1 (docs-only work) |

**Hotspot files.** Many changes need these, so they have a single owner:
- `package.json` and `bun.lock` belong to **delivery**. Other lanes ask with a `QUESTION`.
- `plugin.ts` and `types.ts` belong to **runtime**. A new option from another lane waits until runtime work in progress has merged.
- `tests/native-unit.test.ts` is shared. Add new tests in a separate file per module, not to this file.
- Feature PRs update their own docs page and add a `.changeset/*.md`, since each changeset is a new file and can't conflict.

**Viewpoints aren't lanes:**
- Architecture and ownership are covered by the reviewer on every PR.
- Ecosystem adoption and performance against `bench/` are weekly sweeps that **file issues**; they don't write code.

## Rules for every lane

### Invariants (from the ADRs, checked against `main`)
- **Fail loudly, by name. Never fall back silently.** A file that passes under Jest may fail here only through a named limit with a remedy. Error codes live in `src/errors.mjs`. (ADR 0008, 0017)
- **One owner per module instance.** The same file evaluated by Vite and by Node is two instances. (ADR 0004; `src/native/ownership.mjs`)
- **Every behaviour change goes behind the flag table** in `src/flags.ts` (`{name, adr, since, decideBy}`). At most 2 flags are live, and a flag past its `decideBy` date blocks release. Refactors ship without a flag. (ADR 0001, 0016)
- **The structural scorecard's net total never rises between releases** without a signed exception. (ADR 0002; `scorecard.json`)
- **Every new public option has an ADR** and a section in `website/guide/plugin-options.md`. (ADR 0016)

### Settled decisions (don't reopen them; ADR 0017)
- No parallel v2 runtime.
- No fresh renderer per file.
- No realm or vm-pool isolation.
- Worker-per-file is not the default.
- No single Vite graph for RN.
- No Oxc for RN, Flow or codegen specs.
- No fetching at run time.
- No Hermes, Fabric or Fantom.
- No react-native-web.
- No patching of dependencies, React or scheduler internals.
- Never lead with speed. Never claim Jest "always mocks RN".

### Conventions
- Don't reassign members of objects you don't own (`vi`, `expect`, React Native exports). Add to our own `jest` object, and read state from its owner. Stacked wrappers have caused infinite loops. (Enforced by no-monkey-patching.)
- Use closing keywords (`fixes #N`) only for what the PR itself resolves. For anything else write "fixed by #N". A squash-merge once closed an unrelated issue.
- In a `"type": "module"` package, CommonJS goes in `.cjs` files.
- Recorders must refuse impossible results, such as an all-fail baseline or a tiny RSS, so bad measurements never become data.
- PR text and changesets are neutral and in the user's vocabulary. Credit outside reporters and contributors with a `Thanks @handle for … (#N).` line.

### Traps
- **After every merge, compare files blob by blob.** A file that matches the branch's pre-merge version but differs from main's is a silent revert. Start data files from main and re-apply your change; never "take ours".
- **`package.json` conflicts:** merge both sides' additions, then check that every script it names still exists.
- **Never use `git stash`** for mutation checks. The stash list is shared across worktrees. Mutate with `git show origin/main:<path> > <path>` and restore from a copy.
- **Pass shell flags as literals or arrays.** zsh doesn't word-split an unquoted variable.
- **Wait on a process or PID, never on command-line text.** `pgrep -f 'node .*vitest(\.mjs)? run'`, not a pattern that matches your own shell.
- **Never undo a step in a prepared environment with `git checkout` or `git reset`.** Throw the copy away. Diff `package.json` and the lockfile around every install.

### Working rules
- **Install nothing without a named approval.** Pin an exact version released at least 7 days ago. A different version or an extra peer dependency needs a new approval.
- **Never force-push or rebase a pushed branch.** Merge `origin/main` instead.
- **One PR in review per worker** at a time.
- **Heavy runs (soak, perf, full native matrix) claim the shared machine first** with `~/dev/vitest-native-planning/coordination/slot-run.sh <worker> "<what, ~how long>" [--timed] [--wait] -- <command>`. It runs the command only if the claim succeeds (exit 75 means not claimed), and frees the slot on exit. Nothing heavy runs during a soak or timed run.
- **Measure counts first** (resolutions, evaluations, loads). Wall-clock time is only a tripwire.
- **For long or timed runs, use AC power, keep the lid open, and run under `caffeinate -dims`.** Check `pmset -g log` before believing any timeout: sleep has produced fake 770 s stalls.

### Verification
- **Read the `Test Files` line, not only `Tests`.** It must be non-empty and show no skipped files. Collection failures and empty globs hide from the `Tests` line.
- **Mutation-check every new regression test:** turn the fix off, watch the test fail, then restore it.
- **Loops and classifiers count what they actually checked** and assert a minimum. A swallowed error needs a counted reason. In one test, 294 of 296 cases asserted nothing.
- **Run gates from inside `packages/vitest-native`, with `set -o pipefail`.** Never pipe a gate into `tail`, and make a commit depend on the gate's own exit code.
- **Check a new probe or measurement against a known value once** before trusting it, and confirm which loader loaded the file.
- **Speed claims need repeated runs, medians and the raw output kept.** One sample proves nothing.
- **Run the whole unit suite** (`bun run test`) before pushing any `src` change.

## Commands

Run these from the repository root unless noted.

- `bun install --frozen-lockfile` first, and again after merging `main` into a long-lived branch.
- `bun run test`, `bun run typecheck`, `bun run lint` (CI uses `oxlint --deny-warnings`), `bun run format:check`.
- `bun run test:native` before pushing anything that changes a served mock or the native engine.
- Never use `bunx` or `npx` where the repo runs commands: they fetch packages, and CI enforces this.
- Commit no `.vitest/`, `.tmp/` or `coverage/` output.

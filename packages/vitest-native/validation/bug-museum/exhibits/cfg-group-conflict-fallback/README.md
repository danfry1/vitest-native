# A native project beside a plain project: the hot fallback sets maxWorkers undefined

- **Class:** config
- **Source:** #347 adversarial review (a HIGH bug on main in the same code)
- **Fixed by:** #347 (`origin/fix/cli-max-workers-memory-plan`)
- **Needs:** nothing beyond this repository's install

## The bug

When the native project's planned hot runtime and another project's worker settings conflict, the plugin falls back to the stock runtime and copies the worker count, but copied `undefined` when no count was set (hot auto, no maxWorkers). Vitest 5.0.5 resolves workers per project and rejects the config (its maxWorkers/groupOrder error). Whether projects conflict is version-dependent: 4.1.11 and 5.0.1 give unset projects the root's count.

## Expected behaviour

A workspace of a native project (default hot: auto) beside a plain Node project, with no worker count, runs both projects' tests.

## Notes

Machine-dependent: hot auto decides by worker headroom (this machine: 10 cores, 24 GB). On a machine where auto picks stock, nothing conflicts and the exhibit cannot observe the bug.

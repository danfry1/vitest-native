# A native project beside a plain project: the hot fallback sets maxWorkers undefined

- **Class:** config
- **Source:** #347 adversarial review (a HIGH bug on main in the same code)
- **Fixed by:** #347 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

When the native project's planned hot runtime and another project's worker settings conflict, the plugin falls back to the stock runtime and copies the worker count, but copied `undefined` when no count was set (hot auto, no maxWorkers). Vitest 5.0.5 resolves workers per project and rejects the config: `Projects "native" and "plain" have different 'maxWorkers' but same 'sequence.groupOrder'`. Whether projects conflict is version-dependent: 4.1.11 and 5.0.1 give unset projects the root's count.

## Expected behaviour

A workspace of a native project (`hotRuntime: 'auto'`) beside a plain Node project, with no worker count, runs both projects' tests. Run 1 (the native project alone) must show the engine banner with `hot runtime`: otherwise hot auto did not pick hot on this machine, nothing could conflict, and a pass would prove nothing.

## Notes

The hot runtime is opt-in since #365, so the native project sets `hotRuntime: 'auto'`; under the default (per-file isolation) nothing falls back and the bug cannot occur. Machine-dependent: hot auto decides by worker headroom. check.mjs fails the exhibit (as unexpected) when run 1 shows the stock runtime, so a machine where auto picks stock reports that instead of a vacuous pass. `bugPreventsEveryFile`: the bug rejects the configuration before any file runs, so its signature is the rejection itself.

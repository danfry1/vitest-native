# An explicit maxWorkers above 4 is capped under the hot runtime

- **Class:** config
- **Source:** migration testing (2026-10)
- **Fixed by:** #347 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

The hot memory plan capped workers at 4 and applied the cap to EXPLICIT counts too (a config `maxWorkers: 6` ran 4, with a warning), while a CLI `--maxWorkers` bypassed the plan silently. The report measured 6 workers 35% faster than 4 on a 12-core laptop. #347 makes the cap automatic-only and sizes the memory plan for the workers that actually run.

## Expected behaviour

A config `maxWorkers: 6` under the hot runtime runs with 6 workers (memory permitting; this machine has 24 GB).

## Notes

Machine-dependent: the count an explicit setting may reach is limited by memory.

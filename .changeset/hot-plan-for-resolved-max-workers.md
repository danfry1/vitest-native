---
"vitest-native": minor
---

The hot runtime's memory plan now matches the number of workers that actually run. Vitest applies `--maxWorkers` and `VITEST_MAX_WORKERS` over the worker count the plugin's plan selected, so the plan, the per-worker heap recycle threshold and `VITEST_NATIVE_MEMORY_PLAN` could be sized for fewer workers than ran: `VITEST_MAX_WORKERS=10` ran ten workers under a plan for four. The plan is now rebuilt for the count Vitest resolves, before any worker starts.

A worker count set in the config, with `--maxWorkers` or with `VITEST_MAX_WORKERS` is now limited only by what host or container memory admits. The four-worker cap applies only when the count is chosen automatically. Before, a config-file count above four was cut to four however much memory was free, while the same count on the command line ran in full under the wrong plan. When memory does cap a count the user set, the warning now prints even when `hotRuntime` was left at its default.

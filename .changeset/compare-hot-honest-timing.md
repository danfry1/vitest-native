---
"vitest-native": patch
---

**`vitest-native compare --hot` only says hot is faster or slower when its timing supports it.** It now runs each mode three times by default: one warm-up and two timed runs. It states the median and range of the timed runs. It claims faster or slower only when each mode has at least two timed runs and the ranges don't overlap. Otherwise it says the timing is too thin, or within the spread. The run listing marks warm-up, order-check and worker-check runs as not timed, and `--json` records each run's role. No action needed; pass `--runs 2` for the previous run count, which now gives no speed verdict.

# Single-graph architecture probes

> **Historical branch, not the accepted target.** These probes established why raw
> RN-to-ESM conversion is unsafe and why the CommonJS factory representation matters.
> The accepted architecture enforces one owner per module across an explicit Vite +
> Node boundary; see `../module-isolation/README.md`.

These configs are decision experiments, not public plugin options. They deliberately
do not install the production native engine's Node hooks.

From `packages/vitest-native`:

```bash
# Raw RN source transformed to ESM. Expected to fail in the RN/VirtualizedList
# CommonJS cycle, proving syntax transformation alone is not sufficient.
vitest run --config validation/single-graph/vitest.raw.mts

# RN's CommonJS factory graph hosted inside a Vitest virtual module. The suite is
# green, with two `test.fails` cases recording the remaining mock/CJS-edge gaps.
vitest run --config validation/single-graph/vitest.capsule.mts

# The representative 14-file workload.
vitest run --config validation/single-graph/vitest.capsule.idiomatic.mts
```

The capsule config uses the dependency optimizer to convert RNTL's internal CJS
closure, promotes its external `require("react-native")` back through Vitest, and
adds a live `screen` proxy. Those adapters are intentionally explicit evidence of
the contracts a production single-graph implementation would have to own.

See `docs/runtime-architecture-bakeoff.md` for results and the accepted decision.

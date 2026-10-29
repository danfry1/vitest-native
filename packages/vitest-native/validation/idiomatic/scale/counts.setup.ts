// Writes this worker's cumulative resolution counters after each file (see
// vitest.hot.counts.mts): the require hook's memo and the shared resolver's realms.
import fs from "node:fs";
import { afterAll } from "vitest";

afterAll(() => {
  const out = process.env.VN_COUNTS_FILE;
  if (!out) return;
  const g = globalThis as Record<symbol, unknown>;
  fs.writeFileSync(
    out,
    JSON.stringify({
      memo: g[Symbol.for("vitest-native.resolutionMemo")],
      shared: g[Symbol.for("vitest-native.sharedResolver")],
    }),
  );
});

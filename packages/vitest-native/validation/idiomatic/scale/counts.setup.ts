// Appends this worker's cumulative resolution counters after each file, one JSON line per
// file (see vitest.hot.counts.mts and vitest.stock.counts.mts): the require hook's memo
// and the shared resolver's realms. Under the hot runtime the last line is the worker's
// total; on the stock path each file has a fresh worker, so each line is one file's.
import fs from "node:fs";
import { afterAll, expect } from "vitest";

afterAll(() => {
  const out = process.env.VN_COUNTS_FILE;
  if (!out) return;
  const g = globalThis as Record<symbol, unknown>;
  fs.appendFileSync(
    out,
    `${JSON.stringify({
      file: expect.getState().testPath,
      memo: g[Symbol.for("vitest-native.resolutionMemo")],
      shared: g[Symbol.for("vitest-native.sharedResolver")],
    })}\n`,
  );
});

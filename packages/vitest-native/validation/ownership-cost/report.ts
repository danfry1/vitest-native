// A setup file: after each test file, the thread's running totals. The last line per
// thread is that thread's total.
import fs from "node:fs";
import { threadId } from "node:worker_threads";
import { afterAll } from "vitest";

afterAll(() => {
  const counts = (globalThis as Record<symbol, unknown>)[Symbol.for("vn-cost-counts")];
  if (!counts || !process.env.VN_COST_OUT) return;
  fs.appendFileSync(
    process.env.VN_COST_OUT,
    `${JSON.stringify({ thread: `${process.pid}:${threadId}`, counts })}\n`,
  );
});

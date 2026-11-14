import { test } from "vitest";
import { tally } from "../audit";

test("adds a process listener and never removes it", () => {
  process.on("vn-audit-event" as never, () => tally("process-listener"));
});

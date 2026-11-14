import { test } from "vitest";
import { observe, tallied } from "../audit";

test("observes", () => {
  const before = tallied("process-listener");
  process.emit("vn-audit-event" as never);
  observe("process.listeners", { earlierListenerCalled: tallied("process-listener") > before });
});

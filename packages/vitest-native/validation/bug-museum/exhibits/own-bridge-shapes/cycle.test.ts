// Node requires a module in an ES import cycle before the test imports it: the bridge
// evaluates both, and the import back into the first gets its exports as they are, as
// Vite's own runner (and Node) give a cycle. One instance of each afterwards.
import { expect, test } from "vitest";
import { requireCycle, requireCycleB } from "@m/feature";

test("an import cycle among required modules evaluates once, as Vite's runner does", async () => {
  const a = requireCycle();
  expect(a.a()).toBe("ab");
  expect(requireCycleB().callA()).toBe("ab");
  expect((await import("@m/validator/cyc-a")).a, "one cyc-a").toBe(a.a);
  expect((await import("@m/validator/cyc-b")).callA, "one cyc-b").toBe(requireCycleB().callA);
});

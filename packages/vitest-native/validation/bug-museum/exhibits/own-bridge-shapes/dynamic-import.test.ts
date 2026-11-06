// A module evaluated for Node's require keeps import() relative to its own file.
import { expect, test } from "vitest";
import { requireDyn } from "@m/feature";

test("a dynamic import in a module required first resolves from that module", async () => {
  const dyn = requireDyn();
  expect((await dyn.load("./helper")).label).toBe("helper");
});

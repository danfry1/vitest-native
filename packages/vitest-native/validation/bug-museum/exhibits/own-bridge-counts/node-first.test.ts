// Node first: the library requires the graph, then the test imports it. Each module is
// fetched once and evaluated once; the installed package once, the builtin never.
import { expect, test } from "vitest";
import { MODULES, writeGraph } from "./graph";

writeGraph();
const counts = () => ({
  ...(globalThis as Record<symbol, object>)[Symbol.for("vitest-native.bridge")],
  ...(globalThis as Record<symbol, object>)[Symbol.for("vitest-native.bridged")],
});

test("a 150-module graph required first costs one fetch per module, plus one per external", async () => {
  const { requireGraph } = await import("@m/feature");
  expect(requireGraph().size).toBe(MODULES);
  expect(counts()).toMatchObject({
    threadStarts: 1,
    evaluations: MODULES,
    fetches: MODULES + 1,
  });
  const imported = await import("@m/validator/gen/m0");
  expect(imported.size).toBe(MODULES);
  expect(counts()).toMatchObject({ evaluations: MODULES, fetches: MODULES + 1 });
});

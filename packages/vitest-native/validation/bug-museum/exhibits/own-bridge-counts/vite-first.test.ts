// Vite first: the test imports the graph, then the library requires it. The bridge does
// nothing: no thread, no fetch.
import { expect, test } from "vitest";
import { MODULES, writeGraph } from "./graph";

writeGraph();

test("a graph Vite evaluated first costs the bridge nothing", async () => {
  const imported = await import("@m/validator/gen/m0");
  const { requireGraph } = await import("@m/feature");
  expect(requireGraph().size).toBe(imported.size);
  const bridge = (globalThis as Record<symbol, { threadStarts?: number; fetches?: number }>)[
    Symbol.for("vitest-native.bridge")
  ];
  expect(bridge?.threadStarts ?? 0).toBe(0);
  expect(bridge?.fetches ?? 0).toBe(0);
});

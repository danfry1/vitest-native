/** An async factory that has not settled fails by name for Node's ESM import too (R9). */
import { expect, it, vi } from "vitest";
import { importFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib", async () => ({ source: "async" }));

it("names it", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(importFrom("dispatch-consumer-lib/esm-consumer.mjs")).rejects.toMatchObject({
    code: "MOCK_NOT_SEEN_BY_NODE",
  });
});

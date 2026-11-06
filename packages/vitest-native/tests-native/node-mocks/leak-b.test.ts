/** With leak-a: a mock reaches Node's ESM imports for its own file only (R2, hot runtime). */
import { expect, it, vi } from "vitest";
import "dispatch-target-lib";
import { importFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib", () => ({ source: "file b" }));

it("serves this file's mock", async () => {
  const consumer = (await importFrom("dispatch-consumer-lib/esm-consumer.mjs")) as {
    seen: string;
  };
  expect(consumer.seen).toBe("file b");
});

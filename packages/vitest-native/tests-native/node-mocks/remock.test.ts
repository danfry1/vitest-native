/** A re-mock and an unmock reach Node as they reach the test (R6: no stale index). */
import { expect, it, vi } from "vitest";
import { importFrom, requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib", () => ({ source: "first" }));

it("serves the newer mock after a re-mock", async () => {
  await import("dispatch-target-lib");
  expect(requireFrom("dispatch-target-lib").source).toBe("first");
  const before = (await importFrom("dispatch-consumer-lib/esm-consumer.mjs")) as { seen: string };
  expect(before.seen).toBe("first");
  vi.doMock("dispatch-target-lib", () => ({ source: "second" }));
  expect((await import("dispatch-target-lib")).source).toBe("second");
  expect(requireFrom("dispatch-target-lib").source).toBe("second");
  // A fresh importer's import is the new registration's module, not the one Node's ESM
  // cache holds for the first.
  const after = (await importFrom("dispatch-consumer-lib/esm-consumer-2.mjs")) as { seen: string };
  expect(after.seen).toBe("second");
});

it("serves the real module after an unmock, with another mock registered in the same batch", async () => {
  vi.doUnmock("dispatch-target-lib");
  vi.doMock("dispatch-redirect-lib", () => ({ source: "other" }));
  await import("dispatch-redirect-lib");
  expect(requireFrom("dispatch-target-lib").source).toBe("real");
});

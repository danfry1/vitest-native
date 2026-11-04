/** A re-mock and an unmock reach Node as they reach the test (R6: no stale index). */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib", () => ({ source: "first" }));

it("serves the newer mock after a re-mock", async () => {
  await import("dispatch-target-lib");
  expect(requireFrom("dispatch-target-lib").source).toBe("first");
  vi.doMock("dispatch-target-lib", () => ({ source: "second" }));
  expect((await import("dispatch-target-lib")).source).toBe("second");
  expect(requireFrom("dispatch-target-lib").source).toBe("second");
});

it("serves the real module after an unmock, with another mock registered in the same batch", async () => {
  vi.doUnmock("dispatch-target-lib");
  vi.doMock("dispatch-split-lib", () => ({ source: "other" }));
  await import("dispatch-split-lib");
  expect(requireFrom("dispatch-target-lib").source).toBe("real");
});

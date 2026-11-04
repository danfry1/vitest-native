/** An async factory that has not run fails by name, then is served once it has (R9). */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib", async () => ({ source: "async" }));

it("names an async factory that has not run", () => {
  expect(() => requireFrom("dispatch-target-lib")).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

it("serves it once the test's import has run it", async () => {
  const target = await import("dispatch-target-lib");
  expect(target.source).toBe("async");
  expect(requireFrom("dispatch-target-lib")).toBe(requireFrom("dispatch-target-lib"));
  expect(requireFrom("dispatch-target-lib").source).toBe("async");
});

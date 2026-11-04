/**
 * A vi.mock Node cannot be served synchronously fails by name, never silently with the
 * real module: an async factory that has not run, and a vi.doMock Vitest has not
 * registered yet (it registers queued mocks on the test's next import).
 */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib", async () => ({ source: "async vi.mock" }));

it("names an async factory that has not run", () => {
  expect(() => requireFrom("dispatch-target-lib")).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

it("serves it once the test's own import has run it", async () => {
  const target = await import("dispatch-target-lib");
  expect(target.source).toBe("async vi.mock");
  expect(requireFrom("dispatch-target-lib").source).toBe("async vi.mock");
});

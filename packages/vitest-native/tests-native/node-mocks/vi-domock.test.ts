/** vi.doMock: Node sees it once Vitest has registered it, on the test's next import. */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

it("names a vi.doMock Vitest has not registered yet", () => {
  vi.doMock("dispatch-target-lib", () => ({ source: "vi.doMock" }));
  expect(() => requireFrom("dispatch-target-lib")).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

it("serves it after the next import registers it", async () => {
  await import("dispatch-target-lib");
  expect(requireFrom("dispatch-target-lib").source).toBe("vi.doMock");
});

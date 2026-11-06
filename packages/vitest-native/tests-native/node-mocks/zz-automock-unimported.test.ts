/**
 * An automock or a `__mocks__` redirect this file has not imported is not served, even
 * when an earlier file in the same worker (the hot runtime) built one (R9).
 */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib");
vi.mock("dispatch-redirect-lib");

it("names an automock the test has not imported", () => {
  expect(() => requireFrom("dispatch-target-lib")).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

it("names a redirect the test has not imported", () => {
  expect(() => requireFrom("dispatch-redirect-lib")).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

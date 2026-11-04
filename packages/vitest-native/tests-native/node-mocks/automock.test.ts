/**
 * An automock is not served to Node in this release, and says so by name rather than
 * handing Node the real module (R9).
 */
import { expect, it, vi } from "vitest";
import "dispatch-target-lib";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib");

it("names an automock Node is not served", () => {
  expect(() => requireFrom("dispatch-target-lib")).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

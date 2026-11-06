/**
 * Keyed by the file Node resolves for the requester (R5): a nested copy of the mocked
 * package is not mocked, as under Jest; a package Vite and Node resolve to different
 * files fails by name rather than guessing.
 */
import { expect, it, vi } from "vitest";
import "dispatch-target-lib";
import "dispatch-split-lib";
import { requireFrom } from "dispatch-consumer-lib";
import { requireFrom as requireFromNested } from "dispatch-nested-lib";

vi.mock("dispatch-target-lib", () => ({ source: "mock" }));
vi.mock("dispatch-split-lib", () => ({ source: "mock" }));

it("leaves a nested copy that resolves elsewhere real", () => {
  expect(requireFromNested("dispatch-target-lib")).toEqual({
    source: "real nested",
    kind: "nested",
  });
  expect(requireFrom("dispatch-target-lib").source).toBe("mock");
});

it("names a package Vite and Node resolve to different files", () => {
  expect(() => requireFrom("dispatch-split-lib")).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

/** Under jest-compat: a jest.requireActual partial mock (R8), served to Node as built. */
import { expect, it } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  requireActual<T>(path: string): T;
};

jest.mock("dispatch-target-lib", () => ({
  ...jest.requireActual<object>("dispatch-target-lib"),
  source: "partial",
}));

it("builds the partial mock from the actual module, and serves it", () => {
  const required = requireFrom("dispatch-target-lib");
  expect(required.source).toBe("partial");
  expect(required.kind).toBe("top");
});

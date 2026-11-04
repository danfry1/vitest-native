/** Under jest-compat, a jest.mock of a module is matched before a vi.mock of it. */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("dispatch-target-lib", () => ({ source: "jest.mock" }));
vi.mock("dispatch-target-lib", () => ({ source: "vi.mock" }));

it("serves the jest.mock to an installed package's require", () => {
  expect(requireFrom("dispatch-target-lib").source).toBe("jest.mock");
});

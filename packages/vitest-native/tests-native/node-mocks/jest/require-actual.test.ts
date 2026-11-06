/**
 * Under jest-compat, with nodeMocks: jest.requireActual of a module mocked only by vi.mock
 * is the real module (R8), a project file and an installed package alike.
 */
import { expect, it, vi } from "vitest";
import "../local-thing";
import "dispatch-target-lib";

declare const jest: { requireActual<T>(path: string): T };

vi.mock("../local-thing", () => ({ local: "mock" }));
vi.mock("dispatch-target-lib", () => ({ source: "vi.mock" }));

it("is the real project file", () => {
  expect(jest.requireActual<{ local: string }>("../local-thing").local).toBe("real");
});

it("is the real installed package", () => {
  expect(jest.requireActual<{ source: string }>("dispatch-target-lib").source).toBe("real");
});

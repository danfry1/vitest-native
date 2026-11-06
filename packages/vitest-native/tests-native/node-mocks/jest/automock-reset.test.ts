/**
 * Under jest-compat: jest.resetModules() resets an automock's node but keeps its object,
 * which the test's re-import gets again; so does Node's require (R3), rather than the
 * real module a node still being built would get.
 */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

declare const jest: { resetModules(): void };

vi.mock("dispatch-target-lib");

it("serves the automock the re-import gets", async () => {
  const first = await import("dispatch-target-lib");
  jest.resetModules();
  expect(requireFrom("dispatch-target-lib").fn).toBe(first.fn);
  const again = await import("dispatch-target-lib");
  expect(again.fn).toBe(first.fn);
});

/** An automock is served to Node as the test's automocked module, never the real one (R3). */
import { expect, it, vi } from "vitest";
import * as target from "dispatch-target-lib";
import { importFrom, requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib");

it("serves the automocked module", () => {
  expect(vi.isMockFunction(target.fn)).toBe(true);
  const required = requireFrom("dispatch-target-lib");
  expect(vi.isMockFunction(required.fn)).toBe(true);
  expect(required.fn).toBe(target.fn);
});

it("serves the automocked module to an installed ES module's import", async () => {
  const consumer = (await importFrom("dispatch-consumer-lib/esm-consumer.mjs")) as {
    fnSeen: unknown;
  };
  expect(consumer.fnSeen).toBe(target.fn);
});

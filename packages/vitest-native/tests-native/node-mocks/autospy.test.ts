/** An autospy is served to Node as the test's spied module: the same spies, calling through (R3). */
import { expect, it, vi } from "vitest";
import * as target from "dispatch-target-lib";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib", { spy: true });

it("serves the spied module", () => {
  expect(vi.isMockFunction(target.fn)).toBe(true);
  const required = requireFrom("dispatch-target-lib");
  expect(required.fn).toBe(target.fn);
  expect(required.source).toBe("real");
  expect(required.fn()).toBe("real fn");
  expect(target.fn).toHaveBeenCalledOnce();
});

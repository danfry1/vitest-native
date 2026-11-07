import { expect, it } from "vitest";
import { double } from "./src/worklet";

it("compiles a worklet with the project's worklets plugin", () => {
  expect(double(2)).toBe(4);
  expect(typeof (double as unknown as { __workletHash?: unknown }).__workletHash).toBe("number");
});

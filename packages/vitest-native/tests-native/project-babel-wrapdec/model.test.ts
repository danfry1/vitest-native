import { expect, it } from "vitest";
import Subscription from "./src/Model.js";

it("compiles a decorator file with the app preset's decorators, as an ES module", () => {
  const sub = new Subscription();
  sub.name = "general";
  expect((sub as unknown as { _raw: Record<string, string> })._raw.name).toBe("general");
});

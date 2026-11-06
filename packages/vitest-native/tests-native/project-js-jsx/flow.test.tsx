// A Flow .js file is left to the project's own Flow-stripping plugin (#564 review).
import { expect, it } from "vitest";
import { joined } from "./flow-typed.js";

it("serves a Flow .js file to the project's own transform", () => {
  expect(joined(["a", "b"])).toBe("a,b");
});

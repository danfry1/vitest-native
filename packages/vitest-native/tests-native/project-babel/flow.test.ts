import { expect, it } from "vitest";
import { total } from "./src/flow.js";

it("strips Flow from a project file with the project's preset", () => {
  expect(total([1, 2, 3])).toBe(6);
});

// Project b gets its own root's manual mocks only, though the projects share one
// jestMockTransform() instance.
import { count } from "resident-singleton";

test("this project's mock applies", () => {
  expect(count()).toBe(-3);
});

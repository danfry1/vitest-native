import { expect, test } from "vitest";
import { value } from "./dep";

test("an import does not get the previous file's jest.mock", () => {
  expect(value()).toBe("real-dep");
});

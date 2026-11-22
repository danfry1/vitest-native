import { expect, it } from "vitest";
import { plain } from "./src/plain";

it("leaves a file the plugins have nothing to do in to Oxc", () => {
  expect(plain(1)).toBe(2);
});

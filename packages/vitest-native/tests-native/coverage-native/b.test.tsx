// The same calls from a second file: under the hot runtime it runs in the worker that
// ran a.test.tsx, against the library evaluated again for it.
import { expect, test } from "vitest";
import { grade } from "@cov/rnlib";
import { clamp } from "./src/app-math";

test("the library and the app again", () => {
  expect(grade({ score: 80 })).toBe("high");
  expect(clamp(5, 0, 10)).toBe(5);
});

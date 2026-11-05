// Node compiles @cov/rnlib (a workspace package written for React Native, linked into
// node_modules by scripts/test-coverage-native.mjs); Vite loads ./src/app-math.
import { expect, test } from "vitest";
import { Badge, grade, platformName } from "@cov/rnlib";
import { flowAdd } from "flow-jsx-lib";
import { clamp } from "./src/app-math";

test("a workspace library Node compiles", () => {
  expect(grade({ score: 80 })).toBe("high");
  expect(grade({ score: 0 })).toBe("none");
  expect(platformName()).toBe("ios");
  expect(typeof Badge).toBe("function");
});

test("app source Vite loads", () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-1, 0, 10)).toBe(0);
});

test("a Flow and JSX package in node_modules", () => {
  expect(flowAdd(1, 2)).toBe(3);
});

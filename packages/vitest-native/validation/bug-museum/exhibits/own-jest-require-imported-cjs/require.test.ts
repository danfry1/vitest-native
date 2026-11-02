// A Jest-style test mixing import and require of one CommonJS file.
import { expect, test } from "vitest";
import legacy from "./src/cjs/legacy.js";

declare const require: (id: string) => () => string;

test("require() returns the module.exports the import gave", () => {
  expect(legacy()).toBe("legacy:1");
  const required = require("./src/cjs/legacy.js");
  expect(required).toBe(legacy);
  expect(required()).toBe("legacy:2");
});

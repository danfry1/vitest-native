import { expect, test } from "vitest";
import { greeting } from "./greeting.js";

// Top-level jest.mock, unhoisted in source: it runs only because jestMockTransform()
// rewrites it into a hoisted vi.mock(). Without that plugin the import above wins and
// this reads "REAL", so this file is what makes the plugin load-bearing in the
// generated config the consumer gate runs.
jest.mock("./greeting.js", () => ({ greeting: "MOCKED" }));

test("top-level jest.mock is hoisted and intercepts the import", () => {
  expect(greeting).toBe("MOCKED");
});

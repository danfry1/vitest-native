// A module's own text that looks like the transform's import is not rewritten.
import { expect, test } from "vitest";
import { requireLiteral } from "@m/feature";

test("a string that looks like an SSR import stays as written", () => {
  expect(requireLiteral().text).toBe("await __vite_ssr_import__(");
});

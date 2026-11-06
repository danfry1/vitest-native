// Modules the bridge evaluates import one package name from two directories, each with its
// own copy: each gets the copy resolved from where it is (Vite writes each import resolved,
// so the bridge's external answers are per copy), not the first one asked for.
import { expect, test } from "vitest";
import { requireDupBoth } from "@m/feature";

test("a package with a nested copy resolves per importer through the bridge", async () => {
  expect(requireDupBoth().both, "each importer's own copy").toEqual(["top", "nested"]);
  expect((await import("@m/validator/dup-both")).both).toEqual(["top", "nested"]);
});

// The bug museum judges each column's build against that ref's own installed packages:
// status.mjs refuses a verdict materialised against another ref's (validation/bug-museum).
import { expect, it } from "vitest";
// @ts-expect-error — runtime .mjs
import { depsProblem } from "../validation/bug-museum/lib/deps.mjs";

it("accepts a verdict materialised against its own build's dependencies", () => {
  expect(depsProblem({ build: { sha: "abc" }, deps: { sha: "abc" } })).toBeNull();
});

it("refuses one materialised against another ref's, or that does not say", () => {
  expect(depsProblem({ build: { sha: "abc" }, deps: { sha: "def" } })).toMatch(
    /def's dependencies/,
  );
  expect(depsProblem({ build: { sha: "abc" } })).toMatch(/records no dependencies/);
});

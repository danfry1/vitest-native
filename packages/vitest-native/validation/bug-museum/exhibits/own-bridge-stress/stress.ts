// What every test file checks, for its own slice: Node requires the slice first (through
// the workspace library), so the require bridge evaluates it in Vite and hands Node Vite's
// instances; the test's import then gets the same ones, and Node compiles no copy of its
// own. With several workers, each file's bridge traffic overlaps the others' in the main
// process, and under the hot runtime each worker serves file after file.
import Module from "node:module";
import { expect, test } from "vitest";
import { requireSlice } from "@m/feature";
import { DEPTH } from "./graph";

/** The slice's files Node itself loaded (its module cache), whatever their spelling. */
const nodeCopies = (slice: number) =>
  Object.keys((Module as unknown as { _cache: Record<string, unknown> })._cache).filter((file) =>
    new RegExp(`[\\\\/]gen[\\\\/]s${slice}m\\d+\\.ts$`).test(file),
  );

export function stress(slice: number): void {
  test(`slice ${slice}: the modules Node required first are the ones the test imports`, async () => {
    const required = requireSlice(slice);
    const imported = await import(`@m/validator/gen/s${slice}m0`);
    expect(imported.token, "one slice root").toBe(required.token);
    expect(required.depth, "the whole chain").toBe(DEPTH);
    const shared = await import("@m/validator/shared");
    expect(shared.store, "one shared store").toBe(required.store);
    expect(shared.store.slices, "the slice registered once, in this file").toEqual([slice]);
    expect(nodeCopies(slice), "Node's own copies of the slice").toEqual([]);
  });
}

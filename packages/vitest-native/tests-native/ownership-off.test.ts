// With experimental.ownershipModel off (this suite's config), the shared resolver is
// never built in any realm this worker runs: the require hooks and the in-thread ESM
// loader leave its counters undefined, and the context carries none of its fields.
import { expect, test } from "vitest";
import { projectContext } from "../src/context.mjs";
import { resolverCounters } from "../src/native/shared-resolver.mjs";

test("the shared resolver is not built with the flag off", () => {
  expect(resolverCounters()).toBeUndefined();
  const context = projectContext();
  expect(context?.ownershipModel).toBeUndefined();
  expect(context?.resolverInputs).toBeUndefined();
  expect(context?.resolverInputsHash).toBeUndefined();
});

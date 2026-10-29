// The resolution shadow (ADR-0004): under experimental.ownershipModel, a request the
// shared resolver answers differently from the resolution it replaces is recorded, so
// a behaviour change on a real suite can be listed and explained. generic-mainfield-lib
// has no `exports` and a `react-native` field: Node's require alone takes `main`.
import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { resolverCounters } from "../../src/native/shared-resolver.mjs";

const require = createRequire(import.meta.url);

test("a require the shared resolver answers differently is recorded", () => {
  expect(require("generic-mainfield-lib").entry).toBe("react-native-field");
  const cjs = resolverCounters()?.cjs;
  expect(cjs?.deltaSample).toContainEqual(
    expect.objectContaining({
      request: "generic-mainfield-lib",
      previous: expect.stringMatching(/generic-mainfield-lib[\\/]/),
      next: expect.stringMatching(/generic-mainfield-lib[\\/]/),
    }),
  );
});

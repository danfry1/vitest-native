// The resolution shadow (ADR-0004): under experimental.ownershipModel with diagnostics on,
// a request the shared resolver answers differently from the resolution it replaces is
// written to the run's shadow file, so a behaviour change on a real suite can be listed
// and explained. generic-mainfield-lib has no `exports` and a `react-native` field:
// Node's require alone takes `main`. Runs in vitest.ownership.config.mts --mode shadow.
import fs from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { ownershipShadowFile, resolverCounters } from "../../src/native/shared-resolver.mjs";
import { projectContext } from "../../src/context.mjs";

const require = createRequire(import.meta.url);

test("a require the shared resolver answers differently is written to the shadow file", () => {
  expect(require("generic-mainfield-lib").entry).toBe("react-native-field");
  const delta = {
    request: "generic-mainfield-lib",
    previous: expect.stringMatching(/generic-mainfield-lib[\\/]index\.cjs$/),
    next: expect.stringMatching(/generic-mainfield-lib[\\/]index\.native\.cjs$/),
  };
  expect(resolverCounters()?.cjs?.deltaSample).toContainEqual(expect.objectContaining(delta));
  const file = ownershipShadowFile(
    process.env.VITEST_NATIVE_CONTEXT!,
    projectContext()!.resolverInputsHash!,
  );
  const lines = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  expect(lines).toContainEqual(expect.objectContaining({ realm: "cjs", ...delta }));
});

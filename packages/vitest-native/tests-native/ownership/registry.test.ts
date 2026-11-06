// Under experimental.ownershipModel the plugin builds the precompiled registry in
// configureVitest, once the resolver inputs are final, and publishes it in the context
// before any worker starts: a worker must still get one (a missing registry would fall
// back to per-file loading, silently slower), and it is keyed by those inputs.
import fs from "node:fs";
import { expect, test } from "vitest";
import { projectContext } from "../../src/context.mjs";

test("the worker's context names the registry built with the resolver inputs", () => {
  const context = projectContext();
  expect(context?.resolverInputsHash).toMatch(/^[0-9a-f]+$/);
  expect(context?.registry).toEqual(expect.stringMatching(/rn-ios-[0-9a-f]+\.cjs$/));
  expect(fs.existsSync(context!.registry!)).toBe(true);
});

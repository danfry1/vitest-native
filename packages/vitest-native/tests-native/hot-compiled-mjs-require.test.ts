/**
 * An ES index the engine compiles to CommonJS (an `.mjs` file in a React Native package)
 * under the hot runtime (#847). Node gives the compiled code a `require` that resolves
 * through the module loader, so its require()s of CommonJS siblings must reach those
 * siblings as a require does: linked (Node 22 failed with ERR_VM_MODULE_LINK_FAILURE),
 * returning `module.exports`, one instance with the file's own import of the sibling, and
 * a new one in the next file. The app (fixtures/hot-compiled-mjs-require) runs in one hot
 * worker, with React resident and with freshRuntime.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

const APP = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/hot-compiled-mjs-require",
);
const FRESH = {
  file: "vitest.config.mts",
  find: "hotRuntime: { allowUnboundedMemory: true }",
  replace: "hotRuntime: { allowUnboundedMemory: true, freshRuntime: true }",
};

it.each([
  ["hot", []],
  ["freshRuntime", [FRESH]],
])(
  "%s: a compiled ES index's require()s of CommonJS siblings link, per file",
  (_, edits) => {
    const { status, output } = runApp("hot-compiled-mjs-require", { from: APP, edits });
    expect(status, output).toBe(0);
    expect(output).toMatch(/Tests\s+4 passed/);
  },
  150_000,
);

/**
 * An `.mjs` file in a package the engine compiles loads on every supported Node.
 *
 * The engine's ESM loader serves most compiled modules through Node's CommonJS loader
 * (requireFacade in native/loader.mjs). An `.mjs` file is an ES module wherever it is
 * loaded, so it cannot be: requiring it went through Node's require(esm), which on
 * Node 20.19 and 22.13 fails for a module the ESM loader is still loading ("Cannot
 * require() ES Module ... in a cycle"), and every test importing such a file failed to
 * load there.
 */
import { expect, it } from "vitest";
import { fromMjs } from "rn-ecosystem-lib/esm-helper.mjs";

it("imports an .mjs file from an auto-detected package", () => {
  expect(fromMjs).toBe("mjs");
});

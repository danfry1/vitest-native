/**
 * An `.mjs` file in a package the engine compiles loads on every supported Node.
 *
 * The engine's ESM loader serves compiled modules through Node's CommonJS loader
 * (requireFacade in native/loader.mjs); for an `.mjs` file that is Node's require(esm),
 * which every supported Node completes even for a module the ESM loader is still
 * loading. On Node 20.19 and 22.13 it failed there ("Cannot require() ES Module ... in a
 * cycle"), which is what this file guards.
 */
import { expect, it } from "vitest";
import { fromMjs } from "rn-ecosystem-lib/esm-helper.mjs";
import { viaMjs } from "rn-ecosystem-lib/via-mjs.js";
import { tree } from "rn-ecosystem-lib/rn-platform.mjs";

it("imports an .mjs file from an auto-detected package", () => {
  expect(fromMjs).toBe("mjs");
});

// A compiled module's import of an `.mjs` file is a require() of it: Node's require(esm),
// which the in-thread loader hooks see, so the file and React Native's Flow source
// beneath it are compiled (without that, "Unexpected token '<'", "Unexpected token
// 'typeof'").
it("compiles an .mjs file a compiled module requires, and what it imports", () => {
  expect(viaMjs.os).toBe("ios");
  expect(viaMjs.tree.props.testID).toBe("from-mjs");
  // Imported directly too, it is one module, not a second copy.
  expect(tree).toBe(viaMjs.tree);
});

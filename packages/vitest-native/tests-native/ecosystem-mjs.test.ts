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
import { viaMjs } from "rn-ecosystem-lib/via-mjs.js";
import { tree } from "rn-ecosystem-lib/rn-platform.mjs";

it("imports an .mjs file from an auto-detected package", () => {
  expect(fromMjs).toBe("mjs");
});

// A compiled module's import of an `.mjs` file is a require() of it. Where the ESM
// loader runs on its own thread (Node before 22.15), Node's require(esm) does not
// consult it, so the file and React Native's Flow source beneath it ran uncompiled
// ("Unexpected token '<'", "Unexpected token 'typeof'"). The CommonJS hooks compile it
// (hooks.mjs).
it("compiles an .mjs file a compiled module requires, and what it imports", () => {
  expect(viaMjs.os).toBe("ios");
  expect(viaMjs.tree.props.testID).toBe("from-mjs");
  // Imported directly too, it is one module, not a second copy.
  expect(tree).toBe(viaMjs.tree);
});

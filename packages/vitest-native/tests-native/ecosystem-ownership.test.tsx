/**
 * A React Native ecosystem package must be owned by ONE module system.
 *
 * The native engine runs two: Vite resolves the test graph, Node's CJS resolver
 * serves everything externalized. Ecosystem packages used to be inlined, so Vite
 * executed them — which left Node either unable to load them at all, or holding a
 * second copy with its own module-level state. The second case is the dangerous
 * one: nothing fails, a store configured through one copy simply reads back unset
 * through the other. A real migration lost days to labels rendering as empty
 * strings for exactly this reason.
 *
 * Measured on this fixture before the change, with the default config:
 *
 *     SyntaxError: 'rn-singleton-lib' shipped source Node can't run directly
 *       (Unexpected token '<')
 *
 * They are now externalized and transformed by the Node hooks, like React Native
 * itself, so one graph owns them and a single instance is structural rather than a
 * consequence of Vitest's externalization heuristics.
 *
 * The fixture is a DECLARED dependency on purpose. `detectEcosystemPackages` builds
 * its candidates from declared dependencies, so a fixture that is merely present in
 * node_modules is never considered — which silently invalidated three separate
 * measurements before this was understood.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { configure, read } from "rn-singleton-lib";

const require = createRequire(import.meta.url);

describe("ecosystem package ownership", () => {
  it("loads through Vite, which compiles its untranspiled JSX and ESM source", () => {
    configure("via-vite");
    expect(read()).toBe("via-vite");
  });

  it("loads through Node as well, rather than failing on its source", () => {
    // Before this change the Node hooks transformed only React Native and packages
    // named in `transform`, so this threw "shipped source Node can't run directly".
    const viaNode = require("rn-singleton-lib");
    expect(typeof viaNode.read).toBe("function");
  });

  it("is ONE instance across both module systems", () => {
    // The property the whole change exists for. Writing through the import and
    // reading through the require must observe the same module state.
    configure("written-through-the-import");
    expect(require("rn-singleton-lib").read()).toBe("written-through-the-import");
  });

  it("does not leak state into a require made after a reset", () => {
    configure("");
    expect(require("rn-singleton-lib").read()).toBe("");
  });
});

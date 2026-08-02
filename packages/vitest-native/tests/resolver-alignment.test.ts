/**
 * Vite and Node must land on the same file for a package, or it exists twice with
 * separate module-level state.
 *
 * Vitest forwards `resolve.conditions` to the worker's Node, so `exports`-based
 * packages already agree. Legacy top-level fields have no such bridge: Vite reads
 * `react-native`/`module`, Node reads `main`, and a package publishing both is
 * loaded twice. Nothing fails — a store written through one copy simply reads back
 * unset through the other, which is how a real migration lost days to labels
 * rendering as empty strings.
 *
 * The two divergent fields are NOT the same problem:
 *
 *   `module`  selects a different FORMAT of the same code. Pointing Vite at `main`
 *             costs nothing and collapses the pair.
 *   `react-native` selects a different IMPLEMENTATION — the native build instead of
 *             the web one — and Metro resolves it ahead of `main`. Aligning it
 *             downward would load the web build: a fidelity regression, not a fix.
 *             An existing contract in tests-native/export-conditions.test.ts says so,
 *             and caught this when the first version of the change ignored it.
 *
 * So format-only fields align, `react-native` stays split and is reported by the
 * duplicate-instance warning instead.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { alignLegacyFieldsWithNode } from "../src/plugin.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A package on disk, plus the injected accessors the helper takes. */
function fixture(name: string, manifest: Record<string, unknown>, files: string[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-align-"));
  roots.push(root);
  const dir = path.join(root, "node_modules", name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "module.exports = {};");
  }
  return {
    dir,
    align: (source: string, engineOwned: string[] = []) =>
      alignLegacyFieldsWithNode(
        source,
        (n) => (n === name ? dir : null),
        () => ({ name, ...manifest }),
        (n) => {
          if (n !== name) return null;
          const main = typeof manifest.main === "string" ? manifest.main : "index.js";
          const abs = path.resolve(dir, main);
          // Stand in for Node's resolver: directory and extension resolution included.
          for (const candidate of [abs, path.join(abs, "index.js"), `${abs}.js`]) {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
          }
          return null;
        },
        (n) => engineOwned.includes(n),
      ),
  };
}

describe("alignLegacyFieldsWithNode", () => {
  it("points Vite at main when only the format differs", () => {
    const f = fixture("dual", { main: "./dist/i.cjs", module: "./dist/i.mjs" }, [
      "dist/i.cjs",
      "dist/i.mjs",
    ]);
    expect(f.align("dual")).toBe(path.join(f.dir, "dist", "i.cjs"));
  });

  it("leaves a react-native field alone, so the native build still wins", () => {
    // Aligning this downward would load the web build. Metro resolves the
    // react-native field ahead of main and the engine matches that.
    const f = fixture("rnlib", { main: "./web.js", "react-native": "./native.js" }, [
      "web.js",
      "native.js",
    ]);
    expect(f.align("rnlib")).toBeNull();
  });

  it("leaves it alone when react-native accompanies a format field", () => {
    const f = fixture(
      "both",
      { main: "./web.cjs", module: "./web.mjs", "react-native": "./native.js" },
      ["web.cjs", "web.mjs", "native.js"],
    );
    expect(f.align("both")).toBeNull();
  });

  it("leaves packages with an exports map alone — both resolvers already agree", () => {
    const f = fixture("modern", { main: "./i.cjs", module: "./i.mjs", exports: {} }, [
      "i.cjs",
      "i.mjs",
    ]);
    expect(f.align("modern")).toBeNull();
  });

  it("does nothing when the fields point at the same file", () => {
    const f = fixture("agreed", { main: "./i.js", module: "./i.js" }, ["i.js"]);
    expect(f.align("agreed")).toBeNull();
  });

  it("does nothing for a package declaring no format field", () => {
    const f = fixture("plain", { main: "./i.js" }, ["i.js"]);
    expect(f.align("plain")).toBeNull();
  });

  it("aligns ecosystem packages too, since Node loads them", () => {
    // This once skipped them: ecosystem packages were executed by Vite, so pointing
    // it at `main` would have taken away the source it needed. They are Node-owned
    // now, and excluding them let a dual-format workspace library split again — Vite
    // taking its `module` build while Node took `main`. Reproduced in
    // consumer-tests/monorepo before this changed.
    const f = fixture("ecosystem", { main: "./dist/i.cjs", module: "./dist/i.mjs" }, [
      "dist/i.cjs",
      "dist/i.mjs",
    ]);
    expect(f.align("ecosystem")).toBe(path.join(f.dir, "dist", "i.cjs"));
  });

  it("still leaves react-native itself alone, since Vite gets a facade", () => {
    const f = fixture("react-native", { main: "./index.js", module: "./index.mjs" }, [
      "index.js",
      "index.mjs",
    ]);
    expect(f.align("react-native", ["react-native"])).toBeNull();
  });

  it("ignores subpath imports, which name a file on both sides", () => {
    const f = fixture("dual", { main: "./dist/i.cjs", module: "./dist/i.mjs" }, [
      "dist/i.cjs",
      "dist/i.mjs",
    ]);
    expect(f.align("dual/sub")).toBeNull();
  });

  it("ignores relative and virtual specifiers", () => {
    const f = fixture("dual", { main: "./i.cjs", module: "./i.mjs" }, ["i.cjs", "i.mjs"]);
    expect(f.align("./local")).toBeNull();
    expect(f.align("\0virtual:thing")).toBeNull();
  });

  it("does not redirect when Node cannot resolve the package either", () => {
    // Better to leave resolution alone than to hand Vite a file that cannot load.
    const f = fixture("broken", { main: "./missing.cjs", module: "./i.mjs" }, ["i.mjs"]);
    expect(f.align("broken")).toBeNull();
  });

  it("follows a main that names a directory, as Node does", () => {
    // "main": "./lib" is ordinary, and string-joining it hands Vite a directory.
    // The first version of this change did exactly that and every import of such a
    // package died with "Cannot find module .../lib".
    const f = fixture("dirmain", { main: "./lib", module: "./esm/i.js" }, [
      "lib/index.js",
      "esm/i.js",
    ]);
    expect(f.align("dirmain")).toBe(path.join(f.dir, "lib", "index.js"));
  });

  it("follows an extensionless main, as Node does", () => {
    const f = fixture("extless", { main: "./entry", module: "./esm.js" }, ["entry.js", "esm.js"]);
    expect(f.align("extless")).toBe(path.join(f.dir, "entry.js"));
  });

  it("defaults main to index.js when the manifest omits it", () => {
    const f = fixture("implicit", { module: "./i.mjs" }, ["index.js", "i.mjs"]);
    expect(f.align("implicit")).toBe(path.join(f.dir, "index.js"));
  });
});

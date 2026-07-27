/**
 * The native engine runs two module systems: Vite resolves the test graph, Node's
 * CJS resolver serves everything externalized. The plugin points Vite at React
 * Native's fields — `mainFields: ["react-native", "module", "jsnext:main", "jsnext"]`
 * — and `main`, which is all Node's resolver looks at, is not among them.
 *
 * So any package publishing a `react-native` field (ordinary for the ecosystem) or a
 * `module` field (ordinary for anything dual-format) resolves to a DIFFERENT FILE on
 * each side. When both graphs load it, the package exists twice with separate
 * module-level state, and nothing reports it: writes through one copy are simply
 * invisible to the other.
 *
 * Reported from a real migration of a ~337-file monorepo suite: a store configured
 * during setup read back unset inside a component, so every translated label
 * rendered as "" and 44 tests failed comparing empty strings against expected text.
 * It cost days to find, and the reporter's own conclusion was that one warning
 * naming both paths would have surfaced it immediately.
 *
 * Reproduced here with no jest-compat involved, ruling out their shim as the cause.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetDuplicateReports, checkResolverAgreement } from "../src/native/hooks.mjs";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A package directory under a node_modules, as the resolver would see it. */
function pkg(name: string, manifest: Record<string, unknown>, files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-resolver-"));
  roots.push(root);
  const dir = path.join(root, "node_modules", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, ...manifest }));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "module.exports = {};");
  }
  return dir;
}

describe("resolver agreement", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    _resetDuplicateReports();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    _resetDuplicateReports();
  });

  it("reports a package whose react-native field points elsewhere than main", () => {
    const dir = pkg("split-lib", { main: "./dist/index.cjs", "react-native": "./src/index.js" }, [
      "dist/index.cjs",
      "src/index.js",
    ]);
    checkResolverAgreement("split-lib", path.join(dir, "dist", "index.cjs"));
    expect(warn).toHaveBeenCalledOnce();
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain("resolves to two different files");
    // Both paths, because the pair is what makes it recognisable.
    expect(message).toContain(path.join(dir, "dist", "index.cjs"));
    expect(message).toContain(path.join(dir, "src", "index.js"));
    // The field responsible, so the reader can see why they differ.
    expect(message).toContain('"react-native"');
  });

  it("names the consequence, not just the paths", () => {
    const dir = pkg("split-lib", { main: "./m.cjs", module: "./m.mjs" }, ["m.cjs", "m.mjs"]);
    checkResolverAgreement("split-lib", path.join(dir, "m.cjs"));
    const message = warn.mock.calls[0][0] as string;
    expect(message).toMatch(/state/i);
    expect(message).toMatch(/not shared|invisible/i);
  });

  it("stays quiet when both resolvers agree", () => {
    const dir = pkg("agreed", { main: "./index.js", module: "./index.js" }, ["index.js"]);
    checkResolverAgreement("agreed", path.join(dir, "index.js"));
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet for a package declaring none of Vite's fields", () => {
    const dir = pkg("plain", { main: "./index.js" }, ["index.js"]);
    checkResolverAgreement("plain", path.join(dir, "index.js"));
    expect(warn).not.toHaveBeenCalled();
  });

  it("reports each package once, however often it is resolved", () => {
    const dir = pkg("noisy", { main: "./a.cjs", module: "./b.mjs" }, ["a.cjs", "b.mjs"]);
    for (let i = 0; i < 5; i++) checkResolverAgreement("noisy", path.join(dir, "a.cjs"));
    expect(warn).toHaveBeenCalledOnce();
  });

  it("ignores relative and absolute specifiers", () => {
    const dir = pkg("rel", { main: "./a.cjs", module: "./b.mjs" }, ["a.cjs", "b.mjs"]);
    checkResolverAgreement("./local", path.join(dir, "a.cjs"));
    checkResolverAgreement("/abs/path", path.join(dir, "a.cjs"));
    expect(warn).not.toHaveBeenCalled();
  });

  it("handles a scoped package and its subpath imports", () => {
    const dir = pkg("@scope/lib", { main: "./dist/i.cjs", module: "./dist/i.mjs" }, [
      "dist/i.cjs",
      "dist/i.mjs",
    ]);
    checkResolverAgreement("@scope/lib/sub", path.join(dir, "dist", "i.cjs"));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("@scope/lib");
  });

  it("does not throw on a package directory it cannot read", () => {
    expect(() =>
      checkResolverAgreement("ghost", path.join(os.tmpdir(), "node_modules", "ghost", "i.js")),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});

/**
 * The structural scorecard is a ratchet: Node patch sites, VITEST_NATIVE_* switches,
 * __vitest_native_* globals and swallowed catches in src/ may only fall. See
 * scripts/structural-scorecard.mjs.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BASELINE_PATH, compare, countSource, measure } from "../scripts/structural-scorecard.mjs";

describe("structural scorecard", () => {
  it("matches the committed baseline", () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    expect(compare(measure(), baseline)).toEqual([]);
  });

  it("counts each kind of Node patch site", () => {
    const source = [
      'import { register, registerHooks as hooks } from "node:module";',
      "Module._load = function () {};",
      "Module._resolveFilename = resolver;",
      'Module._extensions[".js"] = compile;',
      "Module._extensions.json = compileJson;",
      "Module.prototype._compile = compile;",
      'register("./loader.mjs", import.meta.url);',
      "hooks({ resolve });",
      "module.registerHooks({ load });",
    ].join("\n");
    expect(countSource(source).nodePatchSites).toBe(8);
  });

  it("does not count comments, comparisons or unrelated register methods", () => {
    const source = [
      "// Module._load = function () {}  (an explanation, not a patch)",
      "/* register('./loader.mjs') */",
      "if (Module._load === original) manifest.register({ id: 'x' });",
      'const text = "Module._load = x";',
    ].join("\n");
    expect(countSource(source).nodePatchSites).toBe(0);
  });

  it("counts distinct env vars and globals, and only catches that swallow", () => {
    const counts = countSource(
      [
        "process.env.VITEST_NATIVE_A; process.env.VITEST_NATIVE_A; env.VITEST_NATIVE_B;",
        "globalThis.__vitest_native_x = 1; globalThis.__vitest_native_x?.();",
        "try { a(); } catch {}",
        "try { a(); } catch (error) {\n  // ignored: best effort\n}",
        "try { a(); } catch (error) { report(error); }",
      ].join("\n"),
    );
    expect([...counts.envVars]).toEqual(["VITEST_NATIVE_A", "VITEST_NATIVE_B"]);
    expect([...counts.globals]).toEqual(["__vitest_native_x"]);
    expect(counts.swallowedCatches).toBe(2);
  });

  it("fails a rise, and a fall the baseline has not taken", () => {
    const baseline = { nodePatchSites: 2, envVars: 1, globals: 1, swallowedCatches: 1 };
    expect(compare({ ...baseline, nodePatchSites: 3 }, baseline)).toEqual([
      expect.stringContaining("nodePatchSites ROSE from 2 to 3"),
    ]);
    expect(compare({ ...baseline, globals: 0 }, baseline)).toEqual([
      expect.stringContaining("globals fell from 1 to 0"),
    ]);
    expect(compare(baseline, baseline)).toEqual([]);
  });
});

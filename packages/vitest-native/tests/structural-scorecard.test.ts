/**
 * The structural scorecard is a ratchet: Node patch sites, VITEST_NATIVE_* switches,
 * __vitest_native_* globals and swallowed catches in src/ may only fall. See
 * scripts/structural-scorecard.mjs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
      'Module["_load"] = wrapped;',
      "Module['_extensions']['.ts'] = compileTs;",
      'Object.defineProperty(Module, "_resolveFilename", { value: resolver });',
    ].join("\n");
    expect(countSource(source).nodePatchSites).toBe(11);
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

  it("counts the indirect patch spellings it claims to", () => {
    const sources = [
      'Reflect.set(Module, "_load", f);',
      "Object.assign(Module, { _load: f });",
      "Object.defineProperties(Module, { _resolveFilename: { value: f } });",
      'const ext = Module._extensions;\next[".ts"] = h;',
      'require.extensions[".ts"] = h;',
      'import * as nm from "node:module";\nnm.register("./l.mjs", u);',
      'import mod from "node:module";\nconst r = mod.register;\nr("./l.mjs");',
    ];
    for (const source of sources) expect(countSource(source).nodePatchSites, source).toBe(1);
  });

  it("counts no-op catch bodies and promise catches that drop the error", () => {
    for (const source of [
      "try { x() } catch { void 0 }",
      "try { x() } catch (e) { ; }",
      "try { x() } catch { undefined }",
      "for (;;) { try { x() } catch { continue; } }",
      "p.catch(() => {});",
      "p.catch(() => undefined);",
    ]) {
      expect(countSource(source).swallowedCatches, source).toBe(1);
    }
    expect(countSource("try { x() } catch { return null; }").swallowedCatches).toBe(0);
  });

  it("reads a regular expression after a keyword's parenthesis, so it hides nothing", () => {
    // `/"/` after `if (ok)` was read as division, its quote opened a string, and the
    // string swallowed the patch that followed.
    expect(
      countSource('if (ok) /"/.test(s); Module._load = f; const q = "x";').nodePatchSites,
    ).toBe(1);
    expect(countSource('const r = (a) / 2; Module._load = f; const q = "x";').nodePatchSites).toBe(
      1,
    );
  });

  it("is stable when files are renamed and moved", () => {
    const src = path.resolve(import.meta.dirname, "..", "src");
    const moved = fs.mkdtempSync(path.join(os.tmpdir(), "vn-scorecard-"));
    try {
      const walk = (dir: string): string[] =>
        fs
          .readdirSync(dir, { withFileTypes: true })
          .flatMap((e) =>
            e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
          );
      walk(src).forEach((file, index) => {
        // Every file to a new name, in a new, deeper directory, in another order.
        const target = path.join(
          moved,
          `d${index % 3}`,
          "nested",
          `f${1000 - index}${path.extname(file)}`,
        );
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target);
      });
      expect(measure(moved)).toEqual(measure(src));
    } finally {
      fs.rmSync(moved, { recursive: true, force: true });
    }
  });
});

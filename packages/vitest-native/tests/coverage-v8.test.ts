// The coverage provider's two decisions (src/native/coverage-v8.mjs), on V8 coverage as
// the test workers report it. End to end, with a real run and a real report:
// scripts/test-coverage-native.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error: runtime .mjs without declarations
import { coverageFile, nodeScripts, nodeSource } from "../src/native/coverage-v8.mjs";

type Range = { startOffset: number; endOffset: number; count: number };
type Fn = { functionName: string; ranges: Range[]; isBlockCoverage: boolean };
type Script = { scriptId: string; url: string; functions: Fn[] };
type Source = { compiled: boolean; code: string; map: unknown } | null;

const root = (end: number, count = 1, inner: Range[] = []): Fn => ({
  functionName: "",
  isBlockCoverage: true,
  ranges: [{ startOffset: 0, endOffset: end, count }, ...inner],
});
const fn = (name: string, start: number, end: number, count: number): Fn => ({
  functionName: name,
  isBlockCoverage: true,
  ranges: [{ startOffset: start, endOffset: end, count }],
});

const dir = fs.realpathSync(os.tmpdir());
const file = path.join(dir, "lib", "index.ts");
const url = pathToFileURL(file).href;
const compiled = "x".repeat(500);
const compiledSource: Source = { compiled: true, code: compiled, map: null };

function convert(scripts: Script[], source: Source) {
  const warnings: string[] = [];
  const out = nodeScripts(
    scripts,
    (asked: string) => (asked === file ? source : null),
    (message: string) => warnings.push(message),
  ) as Script[];
  return { out, warnings };
}

describe("nodeScripts", () => {
  it("keeps only the compiled module from an entry the import facade shares", () => {
    // The facade (loader.mjs, requireFacade) is longer than the code it carries, and
    // its never-called copy reads as zero over the module's offsets.
    const facade = root(620, 1, [{ startOffset: 60, endOffset: 580, count: 0 }]);
    const module = root(500);
    const grade = fn("grade", 100, 200, 3);
    const { out, warnings } = convert(
      [{ scriptId: "1", url, functions: [facade, module, grade] }],
      compiledSource,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.functions).toEqual([module, grade]);
    expect(warnings).toEqual([]);
  });

  it("drops a compiled file's stamped entry: only the hot runtime's facade runs there", () => {
    const { out, warnings } = convert(
      [{ scriptId: "1", url: `${url}?vnhot=3`, functions: [root(620)] }],
      compiledSource,
    );
    expect(out).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("returns a stamped file Node ran as published to the file's own URL", () => {
    const script = { scriptId: "1", url: `${url}?vnhot=2`, functions: [root(40)] };
    const { out } = convert([script], { compiled: false, code: "y".repeat(40), map: null });
    expect(out).toEqual([{ ...script, url }]);
  });

  it("leaves out, with a warning, a file whose compiled code is not what ran", () => {
    const { out, warnings } = convert(
      [{ scriptId: "1", url, functions: [root(499), fn("grade", 10, 20, 1)] }],
      compiledSource,
    );
    expect(out).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(file);
  });

  it("passes through every script Vite loads", () => {
    const script = { scriptId: "1", url, functions: [root(10)] };
    const { out } = convert([script], null);
    expect(out).toEqual([script]);
  });
});

describe("coverageFile", () => {
  it("reads a coverage URL, stamped or not, and a bare path as the file", () => {
    expect(coverageFile(`${url}?vnhot=1`)).toBe(file);
    expect(coverageFile(url)).toBe(file);
    expect(coverageFile(file)).toBe(file);
  });
});

describe("nodeSource", () => {
  const project = (owned: boolean) => ({
    vite: {
      config: {
        plugins: [
          { name: "other" },
          {
            name: "vitest-native",
            api: { nodeCoverageTarget: () => (owned ? { root: dir, platform: "ios" } : null) },
          },
        ],
      },
    },
  });
  const tmp = fs.mkdtempSync(path.join(dir, "vn-coverage-source-"));
  const ts = path.join(tmp, "a.ts");
  const js = path.join(tmp, "b.js");
  fs.writeFileSync(ts, "export const a: number = 1;\n");
  fs.writeFileSync(js, "exports.b = 1;\n");
  const map = { version: 3, sources: ["a.ts"], mappings: "AAAA" };
  const toolchain = {
    needsTransform: () => false,
    transformRN: (_file: string, src: string, rootDir: string, platform: string) =>
      `/* ${rootDir} ${platform} */ ${src}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${Buffer.from(JSON.stringify(map)).toString("base64")}`,
  };

  it("is Node's compiled output and its inline map, with the source named by URL", () => {
    const source = nodeSource(ts, project(true), toolchain);
    expect(source.compiled).toBe(true);
    expect(source.code).toContain(`/* ${dir} ios */`);
    expect(source.map).toEqual({ ...map, sources: [pathToFileURL(ts).href] });
  });

  it("is the file itself when Node runs it as published", () => {
    expect(nodeSource(js, project(true), toolchain)).toEqual({
      compiled: false,
      code: "exports.b = 1;\n",
      map: null,
    });
  });

  it("is null for a file Vite loads, or a project without the plugin", () => {
    expect(nodeSource(ts, project(false), toolchain)).toBeNull();
    expect(nodeSource(ts, { vite: { config: { plugins: [] } } }, toolchain)).toBeNull();
  });
});

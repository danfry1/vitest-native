/**
 * The ownership guard against the shapes an adversarial review of its first version
 * found it missed or mishandled (2026-10-28, docs/ownership-guard.md). Each probe makes
 * a real dual evaluation in a child Vitest run and writes one line: whether the state
 * really split, and what the ledger recorded. The driver asserts on those lines.
 *
 * Shapes: isolateModules restoring the outer Node copy; a require spelled in another
 * case than the import; JSON; vi.mock(path, { spy: true }) then require; require() of an
 * ES module; a query-suffixed import; Node's ESM loader importing project source (both
 * loader modes); a jest.requireActual factory then vi.importActual; a server.deps.inline
 * package that an installed package also requires; and a library that swallows the
 * error in `try { require(x) } catch {}`.
 *
 * Added with the guard's role as a backstop (2026-11): CommonJS project files and
 * `export *` barrels in both orders, `jest.resetModules` and `vi.resetModules` between
 * the two loads, and the hot runtime's per-file reset between two files. Where the
 * engine keeps one instance (Vite first, or a reset that drops Node's copy) the guard
 * must stay quiet; where two copies are live it must name them.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkDir, linkNodeModules, longTempDir } from "./support/link-node-modules.js";

const packageRoot = path.resolve(import.meta.dirname, "..");
const distExists = fs.existsSync(path.join(packageRoot, "dist", "index.mjs"));
const DIR = process.platform === "win32" ? "junction" : "dir";

let base = "";
let app = "";

function write(rel: string, value: string | object) {
  const file = path.join(app, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

const STORE = "export const store = { value: null as string | null };\n";

beforeAll(() => {
  if (!distExists) return;
  base = longTempDir("vn-ownership-probes-");
  app = path.join(base, "app");
  linkNodeModules(path.join(packageRoot, "node_modules"), path.join(app, "node_modules"));
  linkDir(packageRoot, path.join(app, "node_modules", "vitest-native"));
  // Installed packages: one Vite inlines, two that require it through Node, and an ES
  // module package that imports project source.
  write("node_modules/pure-lib/package.json", {
    name: "pure-lib",
    version: "1.0.0",
    main: "index.js",
  });
  write("node_modules/pure-lib/index.js", "exports.store = { value: null };\n");
  write("node_modules/ext-dep/package.json", {
    name: "ext-dep",
    version: "1.0.0",
    main: "index.js",
  });
  write("node_modules/ext-dep/index.js", 'exports.pure = require("pure-lib");\n');
  write("node_modules/opt-dep/package.json", {
    name: "opt-dep",
    version: "1.0.0",
    main: "index.js",
  });
  write(
    "node_modules/opt-dep/index.js",
    'let pure = null;\ntry { pure = require("pure-lib"); } catch { /* optional */ }\nexports.hasPure = () => pure !== null;\n',
  );
  write("node_modules/esm-dep/package.json", {
    name: "esm-dep",
    version: "1.0.0",
    type: "module",
    exports: "./index.js",
  });
  write("node_modules/esm-dep/index.js", 'export { store } from "../../src/fx/e2.mjs";\n');
  // Two installed ES modules for the hot runtime's generation stamp (#669): Vite inlines
  // esm-pure, and esm-ext re-exports it, so a Node import of esm-ext loads it stamped.
  write("node_modules/esm-pure/package.json", {
    name: "esm-pure",
    version: "1.0.0",
    type: "module",
    exports: "./index.js",
  });
  write("node_modules/esm-pure/index.js", "export const store = { value: null };\n");
  write("node_modules/esm-ext/package.json", {
    name: "esm-ext",
    version: "1.0.0",
    type: "module",
    exports: "./index.js",
  });
  write("node_modules/esm-ext/index.js", 'export { store } from "esm-pure";\n');

  write("package.json", { name: "probe-app", private: true, type: "module" });
  write(
    "vitest.config.mts",
    `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestMockTransform } from "vitest-native/jest-compat";
export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: false,
      ownership: {
        mode: process.env.PROBE_OWNERSHIP_MODE as "warn" | "error",
        allow: [{ path: "src/never-dual", reason: "probe: matches nothing" }],
      },
    }),
    jestMockTransform(),
  ],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["vitest-native/jest-compat/setup"],
    include: ["src/*.test.ts"],
    server: { deps: { inline: ["pure-lib"] } },
  },
});
`,
  );
  for (const name of [
    "iso",
    "spy",
    "q",
    "rq",
    "casestore",
    "jr",
    "ja",
    "vr",
    "bstore",
    "vbstore",
  ]) {
    write(`src/fx/${name}.ts`, STORE);
  }
  for (const name of ["legacy", "vlegacy"]) {
    write(`src/fx/${name}.cjs`, "exports.store = { value: null };\n");
  }
  write("src/fx/barrel.ts", 'export * from "./bstore";\n');
  write("src/fx/vbarrel.ts", 'export * from "./vbstore";\n');
  write("src/fx/hot.ts", STORE);
  // Six lines; coverage of it must report no seventh.
  write(
    "src/fx/cov.ts",
    'export function covered(n: number) {\n  if (n > 0) {\n    return "pos";\n  }\n  return "neg";\n}\n',
  );
  write(
    "src/cov.test.ts",
    'import { expect, it } from "vitest";\nimport { covered } from "./fx/cov";\nit("cov", () => expect(covered(1)).toBe("pos"));\n',
  );
  write("src/fx/data.json", '{ "value": null }\n');
  write("src/fx/vdata.json", '{ "value": null }\n');
  // A symlinked directory: Vite can keep the link in its id, Node keys the real path.
  fs.symlinkSync(path.join(app, "src/fx"), path.join(app, "src/fxlink"), DIR);
  write("src/fx/esm.mjs", "export const store = { value: null };\n");
  write("src/fx/e2.mjs", "export const store = { value: null };\n");
  write(
    "src/fx/side.ts",
    "(globalThis as any).__sideCount = ((globalThis as any).__sideCount ?? 0) + 1;\n" + STORE,
  );
  write(
    "src/h.ts",
    `import fs from "node:fs";
const ledger = () => (globalThis as any)[Symbol.for("vitest-native.node-dispatch")]?.channel("ownership")?.ledger;
export function out(name: string, split: boolean, file: RegExp, extra = "") {
  const hits = (ledger()?.conflicts ?? []).filter((c: any) => file.test(c.file));
  const routes = hits.map((c: any) => c.first + ">" + c.second + ":" + c.route + ":" + c.via);
  fs.appendFileSync(process.env.PROBE_OUT!, "PROBE " + name + " split=" + split + " reported=" + (hits.length > 0) + " " + routes.join(",") + " " + extra + "\\n");
}
`,
  );
  const probes: Record<string, string> = {
    iso: `const outer = require("./fx/iso.ts");
  jest.isolateModules(() => { require("./fx/iso.ts"); });
  const viaVite = await import("./fx/iso");
  out("iso", viaVite.store !== outer.store, /fx[\\\\/]iso\\.ts/);`,
    case: `const viaNode = require("./fx/CaseStore.ts");
  const viaVite = await import("./fx/casestore");
  out("case", viaVite.store !== viaNode.store, /casestore\\.ts/i);`,
    json: `const viaNode = require("./fx/data.json");
  const viaVite = (await import("./fx/data.json")).default;
  out("json", viaVite !== viaNode, /data\\.json/);`,
    esm: `const viaNode = require("./fx/esm.mjs");
  const viaVite = await import("./fx/esm.mjs");
  out("esm", viaVite.store !== viaNode.store, /fx[\\\\/]esm\\.mjs/);`,
    symlink: `const viaNode = require("./fxlink/rq.ts");
  const viaVite = await import("./fxlink/rq");
  out("symlink", viaVite.store !== viaNode.store, /fx(link)?[\\/]rq\\.ts/);`,
    query: `const viaNode = require("./fx/q.ts");
  // @ts-ignore
  const viaVite = await import("./fx/q.ts?x=1");
  out("query", viaVite.store !== viaNode.store, /fx[\\\\/]q\\.ts/);`,
    side: `require("./fx/side.ts");
  let code = "none";
  const viaVite = await import("./fx/side").catch((e) => { code = e.code; return null; });
  out("side", viaVite != null, /fx[\\\\/]side\\.ts/, "count=" + (globalThis as any).__sideCount + " code=" + code);`,
    nodeesm: `const viaNode: any = await import("esm-dep");
  const viaVite: any = await import("./fx/e2.mjs");
  out("nodeesm", viaVite.store !== viaNode.store, /e2\\.mjs/, "mode=" + (globalThis as any).__vitest_native_loader_mode);`,
    cjs: `const viaNode = require("./fx/legacy.cjs");
  const viaVite: any = await import("./fx/legacy.cjs");
  out("cjs", (viaVite.default ?? viaVite).store !== viaNode.store, /fx[\\\\/]legacy\\.cjs/);`,
    jsonvite: `const viaVite: any = (await import("./fx/vdata.json")).default;
  const viaNode = require("./fx/vdata.json");
  out("jsonvite", viaVite !== viaNode, /vdata\\.json/);`,
    cjsvite: `const viaVite: any = await import("./fx/vlegacy.cjs");
  const viaNode = require("./fx/vlegacy.cjs");
  out("cjsvite", (viaVite.default ?? viaVite).store !== viaNode.store, /vlegacy\\.cjs/);`,
    barrel: `const viaNode = require("./fx/barrel.ts");
  const viaVite = await import("./fx/barrel");
  out("barrel", viaVite.store !== viaNode.store, /fx[\\\\/](barrel|bstore)\\.ts/);`,
    barrelvite: `const viaVite = await import("./fx/vbarrel");
  const viaNode = require("./fx/vbarrel.ts");
  out("barrelvite", viaVite.store !== viaNode.store, /fx[\\\\/]vb(arrel|store)\\.ts/);`,
    // jest.requireActual loads Node's copy first (Vite has none yet), then the import
    // evaluates Vite's: the guard names the jest-compat route.
    jestactual: `const viaNode = jest.requireActual("./fx/ja.ts");
  const viaVite = await import("./fx/ja");
  out("jestactual", viaVite.store !== viaNode.store, /fx[\\\\/]ja\\.ts/);`,
    jestreset: `const viaNode = require("./fx/jr.ts");
  jest.resetModules();
  const viaVite = await import("./fx/jr");
  out("jestreset", viaVite.store !== viaNode.store, /fx[\\\\/]jr\\.ts/);`,
    vireset: `const viaNode = require("./fx/vr.ts");
  vi.resetModules();
  const viaVite = await import("./fx/vr");
  out("vireset", viaVite.store !== viaNode.store, /fx[\\\\/]vr\\.ts/);`,
    inline: `const pure = await import("pure-lib");
  const ext = require("ext-dep");
  out("inline", ext.pure.store !== (pure as any).store, /pure-lib/);`,
  };
  // Two spellings of one file exist only where the file system ignores case.
  if (!CASE_INSENSITIVE) delete probes.case;
  for (const [name, body] of Object.entries(probes)) {
    write(
      `src/${name}.test.ts`,
      `import { it, vi } from "vitest";
import { out } from "./h";
declare const jest: any;
void vi;
it("${name}", async () => {
  ${body}
});
`,
    );
  }
  write(
    "src/spy.test.ts",
    `import { it, vi } from "vitest";
import { out } from "./h";
import * as spied from "./fx/spy";
vi.mock("./fx/spy", { spy: true });
it("spy", () => {
  const viaNode = require("./fx/spy.ts");
  out("spy", viaNode.store !== spied.store, /fx[\\\\/]spy\\.ts/);
});
`,
  );
  write(
    "src/reqactual.test.ts",
    `import { it, vi } from "vitest";
import { out } from "./h";
import { store } from "./fx/rq";
declare const jest: any;
jest.mock("./fx/rq", () => ({ ...jest.requireActual("./fx/rq"), extra: 1 }));
it("reqactual", async () => {
  const actual: any = await vi.importActual("./fx/rq");
  out("reqactual", actual.store !== store, /fx[\\\\/]rq\\.ts/);
});
`,
  );
  // Two files that share one worker: the first requires a store, the second imports it.
  // Under the hot runtime the per-file reset drops Node's copy in between; under plain
  // `isolate: false` it stays live (docs/ownership-guard.md, "isolate: false").
  const sharedWorker = (
    name: string,
    options: string,
    test: string,
    include = "src/cross/*.test.ts",
  ) =>
    write(
      `vitest.${name}.config.mts`,
      `import { defineConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";
import { reactNative } from "vitest-native";
class ByName extends BaseSequencer {
  async sort(files: any[]) {
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1));
  }
}
export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      ${options},
      ownership: process.env.PROBE_OWNERSHIP_MODE as "warn" | "error",
    }),
  ],
  test: {
    environment: "node",
    include: ["${include}"],
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: ByName },
    ${test}
  },
});
`,
    );
  sharedWorker("hot", "hotRuntime: { allowUnboundedMemory: true }", "");
  sharedWorker("noiso", "hotRuntime: false", "isolate: false,");
  // An installed ES module Node loads under the hot runtime carries its generation
  // (?vnhot=), and the guard checks that record's liveness when Vite evaluates the same
  // file (#669). The first file only advances the generation.
  sharedWorker(
    "hotesm",
    "hotRuntime: { allowUnboundedMemory: true }",
    'server: { deps: { inline: ["esm-pure"] } },',
    "src/hotesm/*.test.ts",
  );
  write("src/hotesm/a.test.ts", `import { it } from "vitest";\nit("a", () => {});\n`);
  write(
    "src/hotesm/b.test.ts",
    `import { it } from "vitest";
import { out } from "../h";
it("b", async () => {
  const viaNode: any = await import("esm-ext");
  const viaVite: any = await import("esm-pure");
  out("hotesm", viaVite.store !== viaNode.store, /esm-pure/);
});
`,
  );
  write(
    "src/cross/a.test.ts",
    `import { it } from "vitest";
it("a", () => {
  require("../fx/hot.ts").store.value = "written by a";
});
`,
  );
  write(
    "src/cross/b.test.ts",
    `import { it } from "vitest";
import { out } from "../h";
it("b", async () => {
  const viaVite = await import("../fx/hot");
  out("cross", viaVite.store.value === "written by a", /fx[\\\\/]hot\\.ts/);
});
`,
  );
  write(
    "src/swallow.test.ts",
    `import { it } from "vitest";
import fs from "node:fs";
import * as pure from "pure-lib";
it("swallow", () => {
  void pure;
  const opt = require("opt-dep");
  fs.appendFileSync(process.env.PROBE_OUT!, "PROBE swallow hasPure=" + opt.hasPure() + "\\n");
});
`,
  );
}, 60_000);

afterAll(() => {
  if (base) fs.rmSync(base, { recursive: true, force: true });
});

function run(mode: "warn" | "error", extraEnv: Record<string, string> = {}, args: string[] = []) {
  const vitestBin = path.join(
    path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
    "vitest.mjs",
  );
  const env: Record<string, string | undefined> = { ...process.env, CI: "1" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST") || key === "NODE_OPTIONS" || key === "NODE_PATH") delete env[key];
  }
  const outFile = path.join(base, `probe-${mode}-${Object.keys(extraEnv).join("-")}.out`);
  fs.rmSync(outFile, { force: true });
  Object.assign(env, { PROBE_OWNERSHIP_MODE: mode, PROBE_OUT: outFile }, extraEnv);
  const child = spawnSync(process.execPath, [vitestBin, "run", ...args], {
    cwd: app,
    encoding: "utf8",
    env,
    timeout: 180_000,
  });
  const lines = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").split("\n") : [];
  const probe = (name: string) => lines.find((line) => line.startsWith(`PROBE ${name} `)) ?? "";
  return { status: child.status, output: `${child.stdout}\n${child.stderr}`, probe };
}

const CASE_INSENSITIVE = process.platform === "darwin" || process.platform === "win32";

const SPLIT_SHAPES = [
  ["iso", "node>vite:require-from-vite:cjs"],
  ["case", "node>vite:require-from-vite:cjs"],
  ["json", "node>vite:require-from-vite:json"],
  ["esm", "node>vite:require-from-vite:require-esm"],
  ["query", "node>vite:require-from-vite:cjs"],
  ["symlink", "node>vite:require-from-vite:cjs"],
  ["spy", "vite>node:require-from-vite:cjs"],
  ["inline", "vite>node:vite-inline:cjs"],
  ["nodeesm", "node>vite:node-esm:esm"],
  ["cjs", "node>vite:require-from-vite:cjs"],
  ["barrel", "node>vite:require-from-vite:cjs"],
  ["vireset", "node>vite:require-from-vite:cjs"],
  ["jestactual", "node>vite:jest-compat:cjs"],
] as const;

// Vite evaluated the file first, so Node's require is handed Vite's instance (#345, and
// `module.exports` for CommonJS): one copy, nothing to report.
const ONE_INSTANCE_SHAPES = ["reqactual", "cjsvite", "barrelvite", "jsonvite"] as const;

it("needs dist", () => {
  expect(distExists, "run `bun run build` before this suite — CI builds first").toBe(true);
});

describe.runIf(distExists)("the ownership guard on the review's shapes", () => {
  it("coverage reports only the file's own lines, the marker none", () => {
    const reports = path.join(base, "coverage");
    const { output } = run("warn", {}, [
      "src/cov.test.ts",
      "--coverage.enabled",
      "--coverage.provider=v8",
      "--coverage.reporter=lcov",
      `--coverage.reportsDirectory=${reports}`,
      "--coverage.include=src/fx/cov.ts",
    ]);
    const lcov = fs.readFileSync(path.join(reports, "lcov.info"), "utf8");
    const lines = [...lcov.matchAll(/^DA:(\d+),(\d+)$/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    const fileLines = fs
      .readFileSync(path.join(app, "src/fx/cov.ts"), "utf8")
      .trimEnd()
      .split("\n").length;
    expect(lines.length, output).toBeGreaterThan(0);
    expect(Math.max(...lines.map(([line]) => line))).toBeLessThanOrEqual(fileLines);
    // Exactly what main reports for this file (measured on 9c02b56): no phantom line 1
    // and no line past the end, from a marker the map attributes to the file.
    expect(lcov.match(/^(?:DA|LF|LH):.*$/gm)).toEqual([
      "DA:2,1",
      "DA:3,1",
      "DA:5,0",
      "LF:3",
      "LH:2",
    ]);
  }, 200_000);

  it("warn: every split is recorded with its route, and summarised whatever the reporter", () => {
    // `--silent` drops the workers' console output: the end-of-run summary must not
    // depend on it.
    const { status, output, probe } = run("warn", {}, ["--silent"]);
    for (const [name, route] of SPLIT_SHAPES) {
      // Two spellings of one file exist only where the file system ignores case.
      if (name === "case" && !CASE_INSENSITIVE) continue;
      // Known gap: on Windows a directory junction in Vite's id is not matched to Node's
      // real path yet (docs/ownership-guard.md, "Known limits"); the split is still real.
      if (name === "symlink" && process.platform === "win32") {
        expect(probe(name), `${name}\n${output}`).toContain("split=true");
        continue;
      }
      expect(probe(name), `${name}\n${output}`).toContain("split=true reported=true");
      expect(probe(name), name).toContain(route);
    }
    for (const name of ONE_INSTANCE_SHAPES) {
      expect(probe(name), `${name}\n${output}`).toContain("split=false reported=false");
    }
    // A barrel's re-exported store is a second file evaluated twice, named on its own:
    // the barrel by the test's require, the store by the barrel Node evaluated.
    expect(probe("barrel"), probe("barrel")).toContain(
      "node>vite:node-owned-source:cjs,node>vite:require-from-vite:cjs",
    );
    // jest.resetModules drops Node's project modules, as Jest's reset empties its one
    // registry: the import that follows is a fresh copy in Jest too, and the old one is
    // no longer live in either system, so there is nothing to report.
    expect(probe("jestreset"), output).toContain("split=true reported=false");
    expect(output).toMatch(/\[vitest-native\] ownership: \d+ file\(s\) were evaluated by both/);
    expect(output).toContain("pure-lib");
    expect(output).toMatch(
      /ownership\.allow: 1 entry exempted nothing in this run:[\s\S]*never-dual/,
    );
    expect(status, output).toBe(0);
  }, 200_000);

  it("switching the mode re-transforms nothing", () => {
    // The guard's mode reaches the worker at run time; it must not be part of the
    // transform cache key, or every switch would recompile the whole project.
    const cache = path.join(app, "node_modules", ".vitest-cache");
    fs.rmSync(cache, { recursive: true, force: true });
    const entries = () =>
      fs.existsSync(cache) ? fs.readdirSync(cache, { recursive: true }).length : 0;
    run("warn", {}, ["src/cov.test.ts"]);
    const afterWarn = entries();
    run("error", {}, ["src/cov.test.ts"]);
    expect(afterWarn).toBeGreaterThan(0);
    expect(entries()).toBe(afterWarn);
  }, 200_000);

  it("error: Vite's second copy has run, so its import fails and so does the file", () => {
    // The marker is the module's last statement (no map work, no phantom coverage), so
    // Vite's second copy is seen after its body ran: count 2. Node's second copy of a
    // CommonJS file is reported once it has loaded, and its require fails (the alias and
    // swallow shapes); a true ES module is refused before it runs.
    const { probe, output } = run("error", {}, ["src/side.test.ts"]);
    expect(probe("side"), output).toContain("count=2 code=SOURCE_EVALUATED_TWICE");
    expect(output).toContain("Vite's copy ran; this file fails.");
    expect(output).toMatch(/evaluated by both Node and Vite during this test file/);
  }, 200_000);

  it("hot runtime: a require in one file and an import in the next are not reported", () => {
    // The per-file reset drops Node's copy, so the second file's import is the only live
    // one: a report here would be a false positive across files (the liveness check).
    const { status, output, probe } = run("error", {}, ["--config", "vitest.hot.config.mts"]);
    expect(output).toContain("hot runtime");
    expect(probe("cross"), output).toContain("split=false reported=false");
    expect(status, output).toBe(0);
  }, 200_000);

  it("hot runtime: an ES module record stamped with its generation is checked, not thrown on", () => {
    const { status, output, probe } = run("warn", {}, ["--config", "vitest.hotesm.config.mts"]);
    expect(output).toContain("hot runtime");
    expect(output).not.toContain("is not an integer typed array");
    expect(probe("hotesm"), output).toContain("split=true reported=true node>vite:vite-inline:esm");
    expect(status, output).toBe(0);
  }, 200_000);

  it("isolate: false without the hot runtime: the same two files are a live twin, reported", () => {
    const { output, probe } = run("warn", {}, ["--config", "vitest.noiso.config.mts"]);
    expect(probe("cross"), output).toContain(
      "split=false reported=true node>vite:require-from-vite:cjs",
    );
  }, 200_000);

  it("error: a dual evaluation a library swallowed still fails its file", () => {
    const { status, output, probe } = run("error", {}, ["src/swallow.test.ts"]);
    // The library's try/catch turned the error into "not installed"...
    expect(probe("swallow"), output).toContain("hasPure=false");
    // ...and the file fails at its end anyway, naming the file.
    expect(output).toMatch(/evaluated by both Node and Vite during this test file/);
    expect(output).toContain(path.join("pure-lib", "index.js"));
    expect(status).not.toBe(0);
  }, 200_000);
});

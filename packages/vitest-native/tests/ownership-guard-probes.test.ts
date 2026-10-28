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
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-ownership-probes-")));
  app = path.join(base, "app");
  fs.mkdirSync(path.join(app, "node_modules"), { recursive: true });
  for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
    if (name.startsWith(".")) continue;
    fs.symlinkSync(
      path.join(packageRoot, "node_modules", name),
      path.join(app, "node_modules", name),
      DIR,
    );
  }
  fs.symlinkSync(packageRoot, path.join(app, "node_modules", "vitest-native"), DIR);
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
      ownership: { allow: [{ path: "src/never-dual", reason: "probe: matches nothing" }] },
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
  for (const name of ["iso", "spy", "q", "rq", "casestore"]) write(`src/fx/${name}.ts`, STORE);
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
const ledger = () => (globalThis as any)[Symbol.for("vitest-native.ownership-ledger")];
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
    inline: `const pure = await import("pure-lib");
  const ext = require("ext-dep");
  out("inline", ext.pure.store !== (pure as any).store, /pure-lib/);`,
  };
  for (const [name, body] of Object.entries(probes)) {
    write(
      `src/${name}.test.ts`,
      `import { it } from "vitest";
import { out } from "./h";
declare const jest: any;
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
  Object.assign(env, { VITEST_NATIVE_OWNERSHIP_MODE: mode, PROBE_OUT: outFile }, extraEnv);
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

const SPLIT_SHAPES = [
  ["iso", "node>vite:require-from-vite:cjs"],
  ["case", "node>vite:require-from-vite:cjs"],
  ["json", "node>vite:require-from-vite:json"],
  ["esm", "node>vite:require-from-vite:require-esm"],
  ["query", "node>vite:require-from-vite:cjs"],
  ["symlink", "node>vite:require-from-vite:cjs"],
  ["spy", "vite>node:require-from-vite:cjs"],
  ["reqactual", "node>vite:jest-compat:cjs"],
  ["inline", "vite>node:vite-inline:cjs"],
  ["nodeesm", "node>vite:node-esm:esm"],
] as const;

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
      expect(probe(name), `${name}\n${output}`).toContain("split=true reported=true");
      expect(probe(name), name).toContain(route);
    }
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

  it("threaded loader: Node's ESM imports are still recorded", () => {
    const { probe, output } = run("warn", { VITEST_NATIVE_LOADER_THREAD: "1" });
    expect(probe("nodeesm"), output).toContain("mode=thread");
    expect(probe("nodeesm"), output).toContain("split=true reported=true");
    expect(probe("esm"), output).toContain("reported=true");
  }, 200_000);

  it("error: Vite's second copy has run, so its import fails and so does the file", () => {
    // The marker is the module's last statement (no map work, no phantom coverage), so
    // Vite's second copy is seen after its body ran: count 2. Node's second copy is
    // still refused before it runs (the alias and swallow shapes).
    const { probe, output } = run("error", {}, ["src/side.test.ts"]);
    expect(probe("side"), output).toContain("count=2 code=MODULE_DUAL_EVALUATION");
    expect(output).toContain("Vite's copy ran; this file fails.");
    expect(output).toMatch(/evaluated by both Node and Vite during this test file/);
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

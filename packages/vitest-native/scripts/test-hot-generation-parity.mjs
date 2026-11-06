// A module generation served through a facade (generationFacade in src/native/loader.mjs)
// must behave in every test file as the module behaves without the hot runtime, and as its
// first generation does. Per-file isolation is the oracle: the same files run with
// `hotRuntime: false`, then hot, then hot with Vitest's default-export interop off, and
// each file records what it saw:
//
//   esm      a Node-run ES module's import of a CommonJS module that the file
//            `jest.mock`s: whether a Module._load override reaches it, as it does (or
//            not) for Node's own CommonJS translator on this Node release
//   parent   `module.parent` of a Node-run CommonJS module the file imports
//   resident a resident module's own import, by absolute URL, of a CommonJS module the
//            first file imported directly: it is never released (from the second file)
//
// Each record must be the same in every file and every run. The hot runs also keep a
// function from each file that reads a CommonJS named import the file made directly,
// and every later file calls all of them: a released generation must still be reached
// through Vitest's interop proxy, and nothing may be released without it.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const FILES = 5;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedName = `.vitest-native-hot-parity-${process.pid}`;
const generatedRoot = path.join(packageRoot, generatedName);
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");

function write(rel, source) {
  const file = path.join(generatedRoot, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

const pkg = (name, extra = {}) =>
  write(
    `node_modules/${name}/package.json`,
    JSON.stringify({ name, version: "1.0.0", main: "index.js", ...extra }),
  );

function generate() {
  pkg("vn-parity-cjs");
  write(
    "node_modules/vn-parity-cjs/index.js",
    `exports.hello = () => "hi";\nexports.parent = String(module.parent);\n`,
  );
  pkg("vn-parity-mocked");
  write("node_modules/vn-parity-mocked/index.js", `exports.hello = () => "real";\n`);
  pkg("vn-parity-esm", { type: "module" });
  write(
    "node_modules/vn-parity-esm/index.js",
    `import { hello } from "vn-parity-mocked";
export const call = () => { try { return hello(); } catch (e) { return "threw: " + e.message; } };
`,
  );
  // A module outside the per-file reset in effect: required once through require(esm),
  // it imports a CommonJS module by absolute URL, and keeps the namespace.
  pkg("vn-parity-lazy", { type: "module", exports: { ".": "./index.js", "./impl": "./impl.cjs" } });
  write("node_modules/vn-parity-lazy/impl.cjs", `exports.value = () => "v";\n`);
  write(
    "node_modules/vn-parity-lazy/index.js",
    `let ns;
export async function get() {
  ns ??= await import(new URL("./impl.cjs", import.meta.url).href);
  try { return String(ns.value()); } catch (e) { return "threw: " + e.message; }
}
`,
  );
  pkg("vn-parity-wrapper");
  write("node_modules/vn-parity-wrapper/index.js", `module.exports = require("vn-parity-lazy");\n`);
  // Imports only the one CommonJS name, so keeping its function keeps nothing else.
  write("held.ts", `import { hello } from "vn-parity-cjs";\nexport const later = () => hello();\n`);
  write(
    "sequencer.ts",
    `import { BaseSequencer, type TestSpecification } from "vitest/node";
export default class ByName extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0));
  }
}
`,
  );
  for (let index = 1; index <= FILES; index += 1) {
    // The first file imports the resident's CommonJS module directly, so its first
    // generation is recorded there; the resident first imports it in the second file, a
    // generation that would be released two files later.
    const first = index === 1;
    write(
      `tests/${String(index).padStart(2, "0")}.test.ts`,
      `import { appendFileSync } from "node:fs";
import { call } from "vn-parity-esm";
import { parent } from "vn-parity-cjs";
import wrapper from "vn-parity-wrapper";
${first ? `import { value } from "vn-parity-lazy/impl";\n` : ""}import { later } from "../held";

jest.mock("vn-parity-mocked", () => ({ hello: () => "mocked" }));

const held = process as unknown as { __vnParityHeld?: (() => string)[] };

it("sees what it would see on its own", async () => {
  ${first ? `expect(value()).toBe("v");\n  ` : ""}const late = (held.__vnParityHeld ??= []).map((call) => {
    try { return call(); } catch (e) { return "threw: " + (e as Error).message; }
  });
  held.__vnParityHeld.push(later);
  const record = { esm: call(), parent, resident: ${first ? "null" : "await wrapper.get()"}, late };
  appendFileSync(process.env.VN_PARITY_LOG!, JSON.stringify(record) + "\\n");
});
`,
    );
  }
  write(
    "vitest.config.mts",
    `import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestMockTransform } from "../dist/jest-compat.mjs";
import ByName from "./sequencer.ts";

const hot = process.env.VN_PARITY_MODE !== "stock";
export default defineConfig({
  root: ${JSON.stringify(packageRoot)},
  plugins: [
    reactNative({ engine: "native", hotRuntime: hot ? { allowUnboundedMemory: true } : false }),
    jestMockTransform(),
  ],
  resolve: { alias: { ...jestCompatAliases() } },
  test: {
    environment: "node",
    globals: true,
    include: [${JSON.stringify(`${generatedName}/tests/*.test.ts`)}],
    setupFiles: [${JSON.stringify(path.join(packageRoot, "dist/jest-compat/setup.mjs"))}],
    fileParallelism: false,
    maxWorkers: 1,
    deps: process.env.VN_PARITY_MODE === "hot-no-interop" ? { interopDefault: false } : {},
    sequence: { shuffle: false, sequencer: ByName },
  },
});
`,
  );
}

function run(mode) {
  const log = path.join(generatedRoot, `${mode}.log`);
  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", "--config", path.join(generatedName, "vitest.config.mts")],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: { ...process.env, VN_PARITY_MODE: mode, VN_PARITY_LOG: log },
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(log)) {
    process.stdout.write(output);
    throw new Error(`hot generation parity: the ${mode} run failed (exit ${result.status})`);
  }
  const records = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (records.length !== FILES) {
    throw new Error(`hot generation parity: ${mode} recorded ${records.length} of ${FILES} files`);
  }
  return records;
}

try {
  generate();
  const stock = run("stock");
  const oracle = { esm: stock[0].esm, parent: stock[0].parent, resident: stock[1].resident };
  const failures = [];
  for (const mode of ["stock", "hot", "hot-no-interop"]) {
    const records = mode === "stock" ? stock : run(mode);
    records.forEach((record, index) => {
      for (const key of Object.keys(oracle)) {
        if (key === "resident" && index === 0) continue;
        if (record[key] !== oracle[key]) {
          failures.push(
            `${mode}, file ${index + 1}: ${key} was ${JSON.stringify(record[key])}, ` +
              `${JSON.stringify(oracle[key])} without the hot runtime`,
          );
        }
      }
      if (mode !== "stock" && record.late.length !== index) {
        failures.push(`${mode}, file ${index + 1}: expected ${index} earlier files' functions`);
      }
      for (const [earlier, value] of record.late.entries()) {
        if (value !== "hi") {
          failures.push(
            `${mode}, file ${index + 1}: file ${earlier + 1}'s import read ${JSON.stringify(value)}`,
          );
        }
      }
    });
  }
  if (failures.length > 0) {
    throw new Error(`hot generation parity:\n  ${failures.join("\n  ")}`);
  }
  console.log(
    `[vitest-native] hot generation parity: ${FILES} files match per-file isolation, hot and ` +
      `hot without interop (${JSON.stringify(oracle)})`,
  );
} finally {
  fs.rmSync(generatedRoot, { force: true, recursive: true });
}

// Under the hot runtime a worker's heap must stop growing once the packages its files
// import are loaded: each test file re-evaluates those packages (the ESM generation, see
// src/native/loader.mjs), and a finished file's copy has to be collectable. Node's ESM
// load cache cannot evict, so a generation served as CommonJS left one full copy of each
// package behind per file (#448).
//
// One hot worker runs FILES generated test files. Each imports two packages, one Node
// runs as published (@babel/core, CommonJS) and one this engine compiles (a generated
// package named in `transform`, with a large payload), checks that it got a new instance
// of each, and, after its last test, collects garbage twice and logs the heap. The gate
// fits a line through the heap after each file past the warm-up and fails when it grows
// more than LIMIT_MIB per file. Measured on Node 24 for 30 files: about 0.1 MiB per file
// with generations released, about 5 MiB per file with every generation kept. A single
// noisy file moves a least-squares slope over 20 files little; the limit sits well
// between the two.
//
// The facades that make a generation collectable need Node's in-thread loader hooks
// (module.registerHooks, see inThreadHooksReliable). On a Node release that runs the
// hooks on their own thread the run is still checked for isolation, and the memory
// check is skipped, by name.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const FILES = 30;
const WARM_UP = 10;
const LIMIT_MIB = 1;
const PAYLOAD_DOUBLES = 262144;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedName = `.vitest-native-hot-memory-${process.pid}`;
const generatedRoot = path.join(packageRoot, generatedName);
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const heapLog = path.join(generatedRoot, "heap.log");
const modeLog = path.join(generatedRoot, "mode.log");

function write(rel, source) {
  const file = path.join(generatedRoot, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

function generate() {
  // A package this engine compiles: Flow syntax, so Node cannot run it as published, and
  // a payload large enough that a copy kept per file shows. It counts its evaluations on
  // `process`, which the hot runtime keeps from file to file.
  write(
    "node_modules/vn-hot-memory-compiled/package.json",
    JSON.stringify({ name: "vn-hot-memory-compiled", version: "1.0.0", main: "index.js" }),
  );
  write(
    "node_modules/vn-hot-memory-compiled/index.js",
    `// @flow
const counts: any = process;
counts.__vnHotMemoryEvaluations = (counts.__vnHotMemoryEvaluations ?? 0) + 1;
exports.evaluation = counts.__vnHotMemoryEvaluations;
// 2 MiB of doubles, made when the module is evaluated: one copy per instance.
exports.payload = Array.from({ length: ${PAYLOAD_DOUBLES} }, (_, index) => index + 0.5);
`,
  );
  write(
    "heap.setup.ts",
    `import { appendFileSync } from "node:fs";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterAll } from "vitest";

// A worker thread rejects --expose-gc in execArgv; this is the in-process equivalent.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

afterAll(() => {
  gc();
  gc();
  appendFileSync(${JSON.stringify(heapLog)}, process.memoryUsage().heapUsed + "\\n");
  appendFileSync(${JSON.stringify(modeLog)}, String((globalThis as any).__vitest_native_loader_mode) + "\\n");
});
`,
  );
  for (let index = 1; index <= FILES; index += 1) {
    const number = String(index).padStart(3, "0");
    write(
      `tests/${number}.test.ts`,
      `import * as babel from "@babel/core";
import compiled from "vn-hot-memory-compiled";
import { expect, it } from "vitest";

// Held weakly, so this check keeps no earlier file's instance alive.
const seen = process as unknown as { __vnHotMemoryBabel?: WeakRef<object>; __vnHotMemoryLast?: number };

it("gets this file's own instance of each package (${number})", () => {
  // The compiled package is evaluated once per file: one more time than for the last.
  expect(compiled.evaluation).toBe((seen.__vnHotMemoryLast ?? 0) + 1);
  seen.__vnHotMemoryLast = compiled.evaluation;
  expect(compiled.payload).toHaveLength(${PAYLOAD_DOUBLES});
  // @babel/core is a new instance too: no earlier file's namespace is this one.
  expect(typeof babel.transformSync).toBe("function");
  expect(seen.__vnHotMemoryBabel?.deref()).not.toBe(babel.transformSync);
  seen.__vnHotMemoryBabel = new WeakRef(babel.transformSync);
});
`,
    );
  }
  write(
    "vitest.config.mts",
    `import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  root: ${JSON.stringify(packageRoot)},
  plugins: [
    reactNative({
      engine: "native",
      transform: ["vn-hot-memory-compiled"],
      hotRuntime: { allowUnboundedMemory: true },
    }),
  ],
  test: {
    environment: "node",
    include: [${JSON.stringify(`${generatedName}/tests/*.test.ts`)}],
    setupFiles: [${JSON.stringify(path.join(generatedRoot, "heap.setup.ts"))}],
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { shuffle: false },
  },
});
`,
  );
}

/** Least-squares slope of `values` against their index. */
function slope(values) {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((value, x) => {
    num += (x - meanX) * (value - meanY);
    den += (x - meanX) ** 2;
  });
  return num / den;
}

try {
  generate();
  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", "--config", path.join(generatedName, "vitest.config.mts")],
    { cwd: packageRoot, encoding: "utf8", env: process.env },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(output);
    throw new Error(`hot memory gate: the run failed (exit ${result.status})`);
  }
  const heap = fs
    .readFileSync(heapLog, "utf8")
    .trim()
    .split("\n")
    .map((line) => Number(line) / 1048576);
  if (heap.length !== FILES) {
    process.stdout.write(output);
    throw new Error(`hot memory gate: expected a heap reading per file, got ${heap.length}`);
  }
  const modes = new Set(fs.readFileSync(modeLog, "utf8").trim().split("\n"));
  const perFile = slope(heap.slice(WARM_UP));
  const curve =
    `${heap[0].toFixed(1)} MiB after file 1, ${heap[WARM_UP - 1].toFixed(1)} after ` +
    `file ${WARM_UP}, ${heap[FILES - 1].toFixed(1)} after file ${FILES}`;
  if (!modes.has("in-thread")) {
    console.log(
      `[vitest-native] hot memory: ${FILES} files isolated; memory not checked, the loader ` +
        `hooks ran on their own thread on Node ${process.version} (${curve}, ` +
        `${perFile.toFixed(2)} MiB per file)`,
    );
  } else if (perFile > LIMIT_MIB) {
    throw new Error(
      `hot memory gate: the worker's heap grew ${perFile.toFixed(2)} MiB per file after ` +
        `garbage collection (limit ${LIMIT_MIB}): ${curve}. A finished file's packages are ` +
        `being kept alive.`,
    );
  } else {
    console.log(
      `[vitest-native] hot memory: ${perFile.toFixed(2)} MiB per file after file ${WARM_UP} ` +
        `(limit ${LIMIT_MIB}); ${curve}`,
    );
  }
} finally {
  fs.rmSync(generatedRoot, { force: true, recursive: true });
}

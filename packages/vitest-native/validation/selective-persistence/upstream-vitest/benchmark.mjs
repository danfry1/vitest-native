import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const defaultPackage = path.dirname(require.resolve("vitest/package.json"));
const vitestBinary = path.resolve(process.argv[2] ?? path.join(defaultPackage, "vitest.mjs"));
const fileCounts = (process.argv[3] ?? "100,500").split(",").map(Number);
const repetitions = Number(process.argv[4] ?? 3);
const selectiveImplementation = process.argv[5] ?? "runner";
const vitestPackage = path.dirname(vitestBinary);
const vitestEntry = pathToFileURL(path.join(vitestPackage, "dist/index.js")).href;
const experimentRoot = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(experimentRoot, "runner.mjs");

if (fileCounts.some((count) => !Number.isInteger(count) || count < 2)) {
  throw new Error("file counts must be comma-separated integers greater than one");
}
if (!Number.isInteger(repetitions) || repetitions < 1) {
  throw new Error("repetitions must be a positive integer");
}
if (!["runner", "module-isolation"].includes(selectiveImplementation)) {
  throw new Error("selective implementation must be runner or module-isolation");
}

function processTreeRss(rootPid) {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((row) => row.length === 3 && row.every(Number.isFinite));
  const children = new Map();
  const rss = new Map();
  for (const [pid, ppid, kib] of rows) {
    rss.set(pid, kib);
    const current = children.get(ppid) ?? [];
    current.push(pid);
    children.set(ppid, current);
  }
  const pending = [rootPid];
  const seen = new Set();
  let total = 0;
  while (pending.length) {
    const pid = pending.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += rss.get(pid) ?? 0;
    pending.push(...(children.get(pid) ?? []));
  }
  return total;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function createFixture(fileCount) {
  const root = mkdtempSync(path.join(os.tmpdir(), `vitest-selective-benchmark-${fileCount}-`));
  mkdirSync(path.join(root, "node_modules"), { recursive: true });
  symlinkSync(vitestPackage, path.join(root, "node_modules", "vitest"), "dir");

  writeFileSync(
    path.join(root, "resident-actual.mjs"),
    `globalThis.__benchmark_resident_evaluations = (globalThis.__benchmark_resident_evaluations ?? 0) + 1;
let checksum = 0;
for (let index = 0; index < 600_000; index++) checksum = (checksum + Math.imul(index, 31)) >>> 0;
export const evaluation = globalThis.__benchmark_resident_evaluations;
export const identity = {};
export { checksum };
`,
  );
  writeFileSync(
    path.join(root, "consumer.mjs"),
    `import * as actual from "./resident-actual.mjs";
globalThis.__benchmark_consumer_evaluations = (globalThis.__benchmark_consumer_evaluations ?? 0) + 1;
export const consumerEvaluation = globalThis.__benchmark_consumer_evaluations;
export const consumerIdentity = {};
export const readActual = () => actual;
`,
  );

  for (let index = 0; index < fileCount; index++) {
    writeFileSync(
      path.join(root, `case-${String(index).padStart(4, "0")}.test.mjs`),
      `import { expect, test } from "vitest";
import { consumerIdentity, readActual } from "./consumer.mjs";
test("case ${index}", () => {
  const actual = readActual();
  expect(actual.evaluation).toBe(1);
  expect(actual.checksum).toBeTypeOf("number");
  globalThis.__benchmark_seen_consumers ??= new Set();
  if (process.env.VN_BENCH_MODE !== "shared") {
    expect(globalThis.__benchmark_seen_consumers.has(consumerIdentity)).toBe(false);
  }
  globalThis.__benchmark_seen_consumers.add(consumerIdentity);
});
`,
    );
  }

  const modes = {
    isolated: { isolate: true },
    selective:
      selectiveImplementation === "runner" ? { isolate: false, runner } : { isolate: false },
    shared: { isolate: false },
  };
  for (const [mode, options] of Object.entries(modes)) {
    const serializedOptions = JSON.stringify({
      ...options,
      include: ["*.test.mjs"],
      maxWorkers: 1,
      minWorkers: 1,
      fileParallelism: false,
      reporters: "dot",
    });
    const testOptions =
      mode === "selective" && selectiveImplementation === "module-isolation"
        ? `{ ...${serializedOptions}, moduleIsolation: { preserveActual: [/\\/resident-actual\\.mjs$/] } }`
        : serializedOptions;
    writeFileSync(
      path.join(root, `vitest.${mode}.config.mjs`),
      `export default { test: ${testOptions} };\n`,
    );
  }
  return root;
}

async function observe(root, mode) {
  const started = performance.now();
  const child = spawn(
    process.execPath,
    [vitestBinary, "run", "--config", path.join(root, `vitest.${mode}.config.mjs`)],
    {
      cwd: root,
      env: {
        ...process.env,
        VN_BENCH_MODE: mode,
        VN_UPSTREAM_VITEST_ENTRY: vitestEntry,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  let peakRssKiB = 0;
  const sample = () => {
    try {
      peakRssKiB = Math.max(peakRssKiB, processTreeRss(child.pid));
    } catch {}
  };
  const timer = setInterval(sample, 25);
  sample();
  const status = await new Promise((resolve) => child.on("exit", resolve));
  clearInterval(timer);
  sample();
  if (status !== 0) {
    process.stderr.write(output);
    throw new Error(`${mode} benchmark exited ${status}`);
  }
  return {
    durationMs: Math.round(performance.now() - started),
    peakRssMiB: Math.round((peakRssKiB / 1024) * 10) / 10,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  vitestBinary,
  fileCounts,
  repetitions,
  selectiveImplementation,
  results: [],
};

for (const fileCount of fileCounts) {
  const root = createFixture(fileCount);
  try {
    const observations = { isolated: [], selective: [], shared: [] };
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const order =
        repetition % 2 ? ["shared", "selective", "isolated"] : ["isolated", "selective", "shared"];
      for (const mode of order) observations[mode].push(await observe(root, mode));
    }
    for (const [mode, values] of Object.entries(observations)) {
      report.results.push({
        fileCount,
        mode,
        observations: values,
        medianDurationMs: median(values.map((value) => value.durationMs)),
        medianPeakRssMiB: median(values.map((value) => value.peakRssMiB)),
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

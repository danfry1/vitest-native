import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const scaleRoot = path.resolve(here, "../idiomatic/scale");
const vitestRoot = path.resolve(
  process.argv[2] ?? "/private/tmp/vitest-module-isolation-upstream",
);
const repetitions = Number(process.argv[3] ?? 1);
const componentCount = Number(process.argv[4] ?? 120);
const modes = (process.argv[5] ?? "default,modules,hot,shared").split(",");
const workers = Number(process.argv[6] ?? 1);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-module-isolation-scale-"));

function run(command, args, cwd, env = {}) {
  const result = execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result;
}

function pack(command, args, cwd) {
  const before = new Set(fs.readdirSync(tempRoot));
  run(command, args, cwd);
  const tarball = fs
    .readdirSync(tempRoot)
    .filter((file) => file.endsWith(".tgz") && !before.has(file))
    .map((file) => path.join(tempRoot, file))[0];
  if (!tarball) throw new Error(`No tarball produced by ${command}`);
  return tarball;
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
  return sorted[Math.floor(sorted.length / 2)];
}

async function observe(mode, repetition) {
  const report = path.join(tempRoot, `.report-${mode}-${repetition}.json`);
  const memory = path.join(tempRoot, `.memory-${mode}.json`);
  const recycleLog = path.join(tempRoot, `.recycles-${mode}.txt`);
  fs.rmSync(report, { force: true });
  fs.rmSync(memory, { force: true });
  fs.rmSync(recycleLog, { force: true });
  const started = performance.now();
  const child = spawn(
    process.execPath,
    [
      "--expose-gc",
      path.join(tempRoot, "node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      "vitest.config.mjs",
      "--reporter=json",
      "--outputFile",
      report,
    ],
    {
      cwd: tempRoot,
      env: {
        ...process.env,
        VN_SCALE_MODE: mode,
        ...(mode.includes("noregistry") ? { VITEST_NATIVE_NO_REGISTRY: "1" } : {}),
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
  const timer = setInterval(sample, 20);
  sample();
  const status = await new Promise((resolve) => child.on("exit", resolve));
  clearInterval(timer);
  sample();
  const results = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : null;
  const afterGc = fs.existsSync(memory) ? JSON.parse(fs.readFileSync(memory, "utf8")) : null;
  if (!results) process.stderr.write(output);
  return {
    status,
    durationMs: Math.round(performance.now() - started),
    peakRssMiB: Math.round((peakRssKiB / 1024) * 10) / 10,
    afterGc,
    recycles: fs.existsSync(recycleLog)
      ? fs.readFileSync(recycleLog, "utf8").trim().split("\n").filter(Boolean).length
      : 0,
    total: results?.numTotalTests ?? 0,
    passed: results?.numPassedTests ?? 0,
    failed: results?.numFailedTests ?? 0,
  };
}

try {
  const vitestTarball = pack(
    "pnpm",
    ["pack", "--pack-destination", tempRoot],
    path.join(vitestRoot, "packages/vitest"),
  );
  const nativeTarball = pack(
    "npm",
    ["pack", "--pack-destination", tempRoot],
    packageRoot,
  );
  fs.writeFileSync(
    path.join(tempRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "vitest-native-module-isolation-scale",
        private: true,
        type: "module",
        dependencies: {
          "@babel/core": "^7.29.7",
          "@react-native/babel-preset": "0.87.0",
          "@react-navigation/native": "7.3.14",
          "@react-navigation/native-stack": "7.18.6",
          "@testing-library/react-native": "14.0.0",
          react: "19.2.8",
          "react-native": "0.87.0",
          "react-native-safe-area-context": "5.8.0",
          "react-native-screens": "4.25.2",
          "react-test-renderer": "19.2.8",
          "resident-singleton": `file:${path.join(
            packageRoot,
            "tests-native/fixtures/resident-singleton",
          )}`,
          "test-renderer": "^1.2.0",
          vite: "8.0.11",
          vitest: `file:${vitestTarball}`,
          "vitest-native": `file:${nativeTarball}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"],
    tempRoot,
  );
  fs.copyFileSync(path.join(scaleRoot, "generate.mjs"), path.join(tempRoot, "generate.mjs"));
  run(process.execPath, ["generate.mjs", String(componentCount)], tempRoot);
  fs.copyFileSync(path.join(scaleRoot, "sharedStore.ts"), path.join(tempRoot, "sharedStore.ts"));
  for (const file of ["bootstrap.mjs", "install-hot-after-setup.mjs", "runner.mjs"]) {
    fs.copyFileSync(path.join(here, file), path.join(tempRoot, file));
  }
  fs.writeFileSync(
    path.join(tempRoot, "recycle-pool.mjs"),
    `
import fs from "node:fs";
import { ThreadsPoolWorker } from "vitest/node";

function recordRecycle(mode) {
  fs.appendFileSync(new URL("./.recycles-" + mode + ".txt", import.meta.url), "recycle\\n");
}

class RecyclableStockWorker extends ThreadsPoolWorker {
  name = "vitest-native:module-recycle-probe";
  filesRun = 0;
  send(message) {
    if (message.type === "run" || message.type === "collect") {
      this.filesRun += message.context.files.length;
    }
    super.send(message);
  }
  canReuse() {
    const reusable = this.filesRun < 50;
    if (!reusable) recordRecycle(process.env.VN_SCALE_MODE);
    return reusable;
  }
}

class MemoryBoundStockWorker extends ThreadsPoolWorker {
  name = "vitest-native:module-memory-probe";
  reportMemory = true;
  lastHeapUsed = 0;
  listenerAttached = false;
  async start() {
    await super.start();
    if (!this.listenerAttached) {
      this.listenerAttached = true;
      this.on("message", message => {
        if (message?.__vitest_worker_response__ && typeof message.usedMemory === "number") {
          this.lastHeapUsed = message.usedMemory;
        }
      });
    }
  }
  canReuse() {
    const reusable = this.lastHeapUsed < 96 * 1024 * 1024;
    if (!reusable) recordRecycle(process.env.VN_SCALE_MODE);
    return reusable;
  }
}

export const recyclePool = {
  name: "vitest-native:module-recycle-probe",
  createPoolWorker: options => new RecyclableStockWorker(options),
};

export const memoryPool = {
  name: "vitest-native:module-memory-probe",
  createPoolWorker: options => new MemoryBoundStockWorker(options),
};
`,
  );
  fs.writeFileSync(
    path.join(tempRoot, "zzz-memory.test.mjs"),
    `
import fs from "node:fs";
import { expect, test } from "vitest";

test("records post-cleanup memory", async () => {
  for (let index = 0; index < 3; index++) {
    globalThis.gc?.();
    await new Promise(resolve => setImmediate(resolve));
  }
  const usage = process.memoryUsage();
  fs.writeFileSync(
    new URL("./.memory-" + process.env.VN_SCALE_MODE + ".json", import.meta.url),
    JSON.stringify({ rss: usage.rss, heapUsed: usage.heapUsed, heapTotal: usage.heapTotal }),
  );
  expect(usage.heapUsed).toBeGreaterThan(0);
});
`,
  );
  fs.writeFileSync(
    path.join(tempRoot, "vitest.config.mjs"),
    `
import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { memoryPool, recyclePool } from "./recycle-pool.mjs";

const mode = process.env.VN_SCALE_MODE;
const root = import.meta.dirname;
const moduleMode = mode.startsWith("modules");
const recycleMode = mode.startsWith("modules-recycle");
const memoryMode = mode.startsWith("modules-memory");
const hotMode = mode.startsWith("hot");
class AlphabeticalSequencer {
  sort(files) { return [...files].sort((left, right) => left.moduleId.localeCompare(right.moduleId)); }
  shard(files) { return files; }
}

export default defineConfig({
  plugins: [
    reactNative({ engine: "native", hotRuntime: hotMode }),
    ...(moduleMode ? [{
      name: "vitest-native:module-isolation-scale",
      configResolved(config) {
        const setupFiles = config.test?.setupFiles ?? [];
        config.test.setupFiles = [
          path.join(root, "bootstrap.mjs"),
          ...setupFiles,
          path.join(root, "install-hot-after-setup.mjs"),
        ];
      },
    }] : []),
  ],
  test: {
    isolate: moduleMode ? "modules" : (mode === "shared" ? false : (hotMode ? undefined : true)),
    pool: recycleMode ? recyclePool : (memoryMode ? memoryPool : undefined),
    runner: moduleMode ? path.join(root, "runner.mjs") : undefined,
    globals: true,
    environment: "node",
    maxWorkers: ${workers},
    minWorkers: ${workers},
    fileParallelism: ${workers > 1},
    sequence: { sequencer: AlphabeticalSequencer, shuffle: false },
    include: [path.join(root, "generated/*.test.tsx"), path.join(root, "zzz-memory.test.mjs")],
  },
});
`,
  );

  const results = Object.fromEntries(modes.map((mode) => [mode, []]));
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const order = repetition % 2 ? [...modes].reverse() : modes;
    for (const mode of order) results[mode].push(await observe(mode, repetition));
  }
  const summary = Object.fromEntries(
    Object.entries(results).map(([mode, values]) => [
      mode,
      {
        observations: values,
        medianDurationMs: median(values.map((value) => value.durationMs)),
        medianPeakRssMiB: median(values.map((value) => value.peakRssMiB)),
        medianAfterGcHeapMiB: median(
          values.map((value) => Math.round((value.afterGc?.heapUsed ?? 0) / 1024 / 1024)),
        ),
        medianAfterGcRssMiB: median(
          values.map((value) => Math.round((value.afterGc?.rss ?? 0) / 1024 / 1024)),
        ),
      },
    ]),
  );
  const files = componentCount + Math.floor(componentCount / 8) + 1;
  console.log(JSON.stringify({ repetitions, componentCount, files, workers, summary }, null, 2));

  for (const mode of modes.filter((mode) => mode !== "shared")) {
    if (results[mode].some((value) => value.status !== 0 || value.failed !== 0)) {
      throw new Error(`${mode} did not preserve correctness at scale`);
    }
  }
  if (modes.includes("shared") && results.shared.every((value) => value.status === 0)) {
    throw new Error("shared negative control unexpectedly passed");
  }
} finally {
  if (process.env.VN_KEEP_MODULE_ISOLATION === "1") {
    console.log(`retained scale fixture: ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// The ownership guard's cost, in counts rather than milliseconds: CommonJS resolutions,
// realpaths, stats, reads, readdirs and existence checks per test file, in the Vitest
// process and in every worker, on the idiomatic scale suite (validation/idiomatic/scale).
//
//   node validation/ownership-cost/run.mjs [--files 60] [--build <package dir>] [--json]
//
// Runs the suite stock (`hotRuntime: false`) and hot, against one build (this
// package's dist/ by default). Run it against a build of main and of a branch and compare:
// a count that rises per file is a cost the branch added to every user's run. Wall time
// is printed for orientation only; it is not the measure.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const scale = path.join(packageRoot, "validation/idiomatic/scale");

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}
const files = Number(arg("files", "60"));
const build = path.resolve(arg("build", packageRoot));
const json = process.argv.includes("--json");

spawnSync(process.execPath, [path.join(scale, "generate.mjs"), String(files)], {
  stdio: "ignore",
});
const generated = fs.readdirSync(path.join(scale, "generated")).filter((f) => f.endsWith(".tsx"));

const config = (hot) => `import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from ${JSON.stringify(pathToFileURL(path.join(build, "dist/index.mjs")).href)};
export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: ${hot ? "{ allowUnboundedMemory: true }" : "false"},
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { shuffle: false },
    setupFiles: [${JSON.stringify(path.join(here, "report.ts"))}],
    include: [${JSON.stringify(path.join(scale, "generated/*.test.tsx"))}],
  },
});
`;

function run(mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-ownership-cost-"));
  const configFile = path.join(scale, `.cost-${mode}-${process.pid}.config.mts`);
  const out = path.join(dir, "counts.ndjson");
  fs.writeFileSync(configFile, config(mode === "hot"));
  const env = { ...process.env, VN_COST_OUT: out };
  for (const key of Object.keys(env)) if (key.startsWith("VITEST")) delete env[key];
  env.NODE_OPTIONS = `--require ${path.join(here, "counter.cjs")}`;
  const started = Date.now();
  const child = spawnSync(
    process.execPath,
    [path.join(packageRoot, "node_modules/vitest/vitest.mjs"), "run", "--config", configFile],
    { cwd: packageRoot, env, encoding: "utf8" },
  );
  const ms = Date.now() - started;
  fs.rmSync(configFile, { force: true });
  if (child.status !== 0) {
    throw new Error(`${mode} run failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
  }
  const lines = fs.readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  fs.rmSync(dir, { recursive: true, force: true });
  // Each thread's last line is its total; the Vitest process writes once, at exit.
  const last = new Map();
  for (const line of lines) last.set(line.thread, line.counts);
  const sum = (filter) => {
    const total = {};
    for (const [thread, counts] of last) {
      if (!filter(thread)) continue;
      for (const [key, value] of Object.entries(counts)) total[key] = (total[key] ?? 0) + value;
    }
    return total;
  };
  const perFile = (total) =>
    Object.fromEntries(Object.entries(total).map(([k, v]) => [k, +(v / generated.length).toFixed(2)]));
  const workers = sum((t) => t !== "main");
  const main = sum((t) => t === "main");
  return { mode, files: generated.length, ms, workers, main, workersPerFile: perFile(workers), mainPerFile: perFile(main) };
}

// Each mode runs twice and the second run counts: the first fills Vite's transform cache,
// whose state would otherwise decide the Vitest process's counts.
const results = ["stock", "hot"].map((mode) => (run(mode), run(mode)));
if (json) console.log(JSON.stringify({ build, results }, null, 2));
else {
  console.log(`build: ${build}`);
  for (const r of results) {
    console.log(`\n${r.mode}: ${r.files} files, ${(r.ms / 1000).toFixed(1)} s (orientation only)`);
    console.log(`  workers, per file: ${JSON.stringify(r.workersPerFile)}`);
    console.log(`  Vitest process, per file: ${JSON.stringify(r.mainPerFile)}`);
  }
}

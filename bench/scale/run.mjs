// M4 scale-benchmark harness. Runs the SAME generated RNTL component suite at
// several file counts × worker counts across four contenders — jest (RN preset),
// native stock (isolate:true), native hot, mock — and reports total wall time,
// marginal per-file cost (least-squares slope across file counts), and peak RSS
// (sampled across the whole process subtree, so jest's child-process workers and
// vitest's in-process thread workers are measured on equal terms).
//
// Cold = first run after caches are cleared. Warm = median of WARM subsequent
// runs. Peak RSS is the max sampled over cold+warm for that cell.
//
// Usage:
//   node scale/run.mjs                     # full sweep (slow; minutes)
//   BENCH_FILES=5 BENCH_WORKERS_SWEEP=1 BENCH_WARM=1 node scale/run.mjs   # quick validate
//   BENCH_ENGINES=native-hot,mock node scale/run.mjs                       # subset
//
// Env knobs: BENCH_FILES (csv), BENCH_WORKERS_SWEEP (csv), BENCH_WARM (int),
// BENCH_ENGINES (csv of: jest,native-stock,native-vm,native-hot,mock).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BENCH_DIR = path.dirname(import.meta.dirname); // .../bench
const SCALE_DIR = import.meta.dirname; // .../bench/scale
const bin = (n) => path.join(BENCH_DIR, "node_modules", ".bin", n);

const FILE_COUNTS = (process.env.BENCH_FILES || "5,50,200").split(",").map(Number);
const WORKER_COUNTS = (process.env.BENCH_WORKERS_SWEEP || "1,8").split(",").map(Number);
const WARM = Number(process.env.BENCH_WARM || 2);
const ENGINE_FILTER = process.env.BENCH_ENGINES?.split(",");

// Each engine: how to launch it for a given worker count. cmd() returns argv
// (run with cwd=BENCH_DIR so include globs + plugin project-root match the other
// bench configs). Vitest engines read BENCH_WORKERS from env; jest takes a flag.
const ENGINES = {
  jest: {
    label: "jest (RN preset)",
    cmd: (w) => [bin("jest"), "--config", "scale/jest.config.cjs", "--silent", `--maxWorkers=${w}`],
    env: () => ({}),
  },
  "native-stock": {
    label: "native stock (isolate:true)",
    cmd: () => [bin("vitest"), "run", "--config", "scale/vitest.native-stock.mts"],
    env: (w) => ({ BENCH_WORKERS: String(w) }),
  },
  "native-hot": {
    label: "native hot",
    cmd: () => [bin("vitest"), "run", "--config", "scale/vitest.native-hot.mts"],
    env: (w) => ({ BENCH_WORKERS: String(w) }),
  },
  "native-vm": {
    label: "native vmThreads",
    cmd: () => [bin("vitest"), "run", "--config", "scale/vitest.native-vm.mts"],
    env: (w) => ({ BENCH_WORKERS: String(w) }),
  },
  mock: {
    label: "mock",
    cmd: () => [bin("vitest"), "run", "--config", "scale/vitest.mock.mts"],
    env: (w) => ({ BENCH_WORKERS: String(w) }),
  },
};

const engineKeys = Object.keys(ENGINES).filter((k) => !ENGINE_FILTER || ENGINE_FILTER.includes(k));

function clearCaches() {
  spawnSync(bin("jest"), ["--clearCache", "--config", "scale/jest.config.cjs"], {
    cwd: BENCH_DIR,
    stdio: "ignore",
  });
  const tmp = os.tmpdir();
  for (const p of [
    path.join(BENCH_DIR, "node_modules", ".vite"),
    path.join(BENCH_DIR, "node_modules", ".vitest"),
    ...fs.readdirSync(tmp).filter((d) => d.startsWith("vitest-native-cache")).map((d) => path.join(tmp, d)),
    ...fs.readdirSync(tmp).filter((d) => d.startsWith("jest")).map((d) => path.join(tmp, d)),
  ]) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

// Sum RSS (bytes) across rootPid and all descendants. macOS `ps` rss is in KB.
function subtreeRss(rootPid) {
  const res = spawnSync("ps", ["-axo", "pid=,ppid=,rss="], { encoding: "utf8" });
  if (res.status !== 0) return 0;
  const kids = new Map(); // ppid -> [pid]
  const rss = new Map(); // pid -> bytes
  for (const line of res.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (!m) continue;
    const pid = +m[1], ppid = +m[2], kb = +m[3];
    rss.set(pid, kb * 1024);
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid).push(pid);
  }
  let total = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += rss.get(pid) || 0;
    for (const c of kids.get(pid) || []) stack.push(c);
  }
  return total;
}

// Run a command, polling subtree RSS. Returns { ms, peakRss, ok, passed }.
function timeRun(cmd, env) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: BENCH_DIR,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    let peak = 0;
    const poll = setInterval(() => {
      const r = subtreeRss(child.pid);
      if (r > peak) peak = r;
    }, 75);
    child.on("close", (code) => {
      clearInterval(poll);
      const ms = Date.now() - t0;
      const clean = out.replace(/\x1b\[[0-9;]*m/g, "");
      const passed = /Tests:?\s+(\d+) passed/.exec(clean)?.[1] || "?";
      resolve({ ms, peakRss: peak, ok: code === 0, passed });
    });
  });
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const mb = (b) => (b / 1024 / 1024).toFixed(0);

// Least-squares slope of y vs x (ms per file).
function slope(points) {
  const n = points.length;
  if (n < 2) return null;
  const sx = points.reduce((a, [x]) => a + x, 0);
  const sy = points.reduce((a, [, y]) => a + y, 0);
  const sxx = points.reduce((a, [x]) => a + x * x, 0);
  const sxy = points.reduce((a, [x, y]) => a + x * y, 0);
  const d = n * sxx - sx * sx;
  return d === 0 ? null : (n * sxy - sx * sy) / d;
}

console.log(`\nM4 scale benchmark`);
console.log(`files: ${FILE_COUNTS.join(", ")} | workers: ${WORKER_COUNTS.join(", ")} | warm runs: ${WARM}`);
console.log(`engines: ${engineKeys.join(", ")}`);
console.log(`(node ${process.version}, ${os.cpus().length} cores, ${os.cpus()[0].model})\n`);

// cells[engine][workers] = [{ files, cold, warm, peakRss, ok, passed }, ...]
const cells = {};
for (const k of engineKeys) cells[k] = {};

for (const files of FILE_COUNTS) {
  process.stdout.write(`\n### Generating ${files}-file suite… `);
  spawnSync("node", ["scale/gen.mjs", String(files)], { cwd: BENCH_DIR, stdio: "ignore" });
  console.log("done");
  for (const w of WORKER_COUNTS) {
    for (const k of engineKeys) {
      const eng = ENGINES[k];
      process.stdout.write(`  [${files}f w=${w}] ${eng.label}: caches… `);
      clearCaches();
      const cold = await timeRun(eng.cmd(w), eng.env(w));
      process.stdout.write(`cold ${cold.ms}ms (${cold.ok ? cold.passed + "p" : "FAIL"}) warm `);
      const warms = [];
      let peak = cold.peakRss;
      for (let i = 0; i < WARM; i++) {
        const r = await timeRun(eng.cmd(w), eng.env(w));
        warms.push(r.ms);
        if (r.peakRss > peak) peak = r.peakRss;
        process.stdout.write(`${r.ms} `);
      }
      const warm = warms.length ? median(warms) : cold.ms;
      console.log(`→ ${warm}ms, ${mb(peak)}MB`);
      (cells[k][w] ||= []).push({ files, cold: cold.ms, warm, peakRss: peak, ok: cold.ok, passed: cold.passed });
    }
  }
}

// ---- Report ----
console.log(`\n\n## Results\n`);
for (const w of WORKER_COUNTS) {
  console.log(`### ${w} worker${w > 1 ? "s" : ""}\n`);
  console.log(`| Engine | ${FILE_COUNTS.map((f) => `${f}f warm`).join(" | ")} | ms/file | peak RSS @${FILE_COUNTS.at(-1)}f |`);
  console.log(`|---|${FILE_COUNTS.map(() => "--:").join("|")}|--:|--:|`);
  for (const k of engineKeys) {
    const row = cells[k][w] || [];
    const byFiles = Object.fromEntries(row.map((r) => [r.files, r]));
    const warmCells = FILE_COUNTS.map((f) => {
      const c = byFiles[f];
      if (!c) return "—";
      return c.ok ? `${c.warm}` : `FAIL`;
    });
    const sl = slope(row.filter((r) => r.ok).map((r) => [r.files, r.warm]));
    const lastCell = byFiles[FILE_COUNTS.at(-1)];
    console.log(
      `| ${ENGINES[k].label} | ${warmCells.join(" | ")} | ${sl == null ? "—" : sl.toFixed(1)} | ${lastCell ? mb(lastCell.peakRss) + "MB" : "—"} |`,
    );
  }
  console.log("");
  // Speedup vs jest at the largest file count (warm).
  const jrow = (cells.jest?.[w] || []).find((r) => r.files === FILE_COUNTS.at(-1));
  if (jrow?.ok) {
    console.log(`Speedup vs jest @${FILE_COUNTS.at(-1)}f warm:`);
    for (const k of engineKeys) {
      if (k === "jest") continue;
      const r = (cells[k][w] || []).find((x) => x.files === FILE_COUNTS.at(-1));
      if (r?.ok) console.log(`  ${ENGINES[k].label}: ${(jrow.warm / r.warm).toFixed(2)}×`);
    }
    console.log("");
  }
}

// JSON artifact for the record.
const artifact = {
  node: process.version,
  cores: os.cpus().length,
  cpu: os.cpus()[0].model,
  fileCounts: FILE_COUNTS,
  workerCounts: WORKER_COUNTS,
  warm: WARM,
  cells,
};
const outPath = path.join(SCALE_DIR, "results.json");
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(`\nwrote ${path.relative(BENCH_DIR, outPath)}\n`);

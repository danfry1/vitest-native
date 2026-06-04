// Head-to-head benchmark runner: jest (RN preset) vs vitest-native native vs mock.
// Same suite, same machine, same moment. Reports cold (caches cleared) + warm median.
//
// Usage: node run.mjs [warmRuns]   (default 3 warm runs; file count set via gen.mjs)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HERE = import.meta.dirname;
const WARM = Number(process.argv[2] || 3);
const bin = (n) => path.join(HERE, "node_modules", ".bin", n);

const RUNNERS = {
  jest: { cmd: [bin("jest"), "--config", "jest.config.cjs", "--silent"] },
  "vitest-native": { cmd: [bin("vitest"), "run", "--config", "vitest.native.mts"] },
  "vitest-native (isolate:false)": { cmd: [bin("vitest"), "run", "--config", "vitest.native-shared.mts"] },
  "vitest-mock": { cmd: [bin("vitest"), "run", "--config", "vitest.mock.mts"] },
};

function clearCaches() {
  // jest transform cache (its own --clearCache) + RN haste; vite + vitest-native disk cache.
  spawnSync(bin("jest"), ["--clearCache", "--config", "jest.config.cjs"], { cwd: HERE, stdio: "ignore" });
  for (const p of [
    path.join(HERE, "node_modules", ".vite"),
    path.join(HERE, "node_modules", ".vitest"),
    ...fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("vitest-native-cache")).map((d) => path.join(os.tmpdir(), d)),
    ...fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("jest")).map((d) => path.join(os.tmpdir(), d)),
  ]) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function time(cmd) {
  const t0 = Date.now();
  const res = spawnSync(cmd[0], cmd.slice(1), { cwd: HERE, stdio: "pipe", encoding: "utf8" });
  const ms = Date.now() - t0;
  const out = ((res.stdout || "") + (res.stderr || "")).replace(/\x1b\[[0-9;]*m/g, "");
  const passed = /Tests:?\s+(\d+) passed/.exec(out)?.[1] || "?";
  return { ms, ok: res.status === 0, passed };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const fileCount = fs.readdirSync(path.join(HERE, "shared")).filter((f) => f.endsWith(".test.tsx")).length;

console.log(`\nBenchmark: ${fileCount} files / ${fileCount * 3} tests, ${WARM} warm runs each\n`);
const results = {};
for (const [name, { cmd }] of Object.entries(RUNNERS)) {
  process.stdout.write(`${name}: clearing caches… `);
  clearCaches();
  const cold = time(cmd);
  process.stdout.write(`cold ${cold.ms}ms (${cold.ok ? cold.passed + " passed" : "FAILED"})… warm `);
  const warms = [];
  for (let i = 0; i < WARM; i++) { const w = time(cmd); warms.push(w.ms); process.stdout.write(`${w.ms} `); }
  const warm = median(warms);
  results[name] = { cold: cold.ms, warm, ok: cold.ok, passed: cold.passed };
  console.log(`→ warm median ${warm}ms`);
}

console.log("\n| Runner | Cold | Warm (median) | Status |");
console.log("|--------|------|---------------|--------|");
for (const [name, r] of Object.entries(results)) {
  console.log(`| ${name} | ${r.cold}ms | ${r.warm}ms | ${r.ok ? r.passed + " passed" : "FAILED"} |`);
}
const base = results.jest?.warm;
if (base) {
  console.log("\nSpeedup vs jest (warm):");
  for (const [name, r] of Object.entries(results)) {
    if (name !== "jest" && r.ok) console.log(`  ${name}: ${(base / r.warm).toFixed(2)}× `);
  }
}
console.log("\n(node version " + process.version + ", " + os.cpus().length + " cores)\n");

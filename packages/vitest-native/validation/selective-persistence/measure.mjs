import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const config = path.resolve(process.argv[2]);
const repetitions = Number(process.argv[3] ?? 1);
const require = createRequire(import.meta.url);
const vitest = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");

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
    const list = children.get(ppid) ?? [];
    list.push(pid);
    children.set(ppid, list);
  }
  let total = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += rss.get(pid) ?? 0;
    stack.push(...(children.get(pid) ?? []));
  }
  return total;
}

async function measure() {
  const started = performance.now();
  const child = spawn(process.execPath, [vitest, "run", "--config", config], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  let peakRssKiB = 0;
  const sample = () => {
    try {
      peakRssKiB = Math.max(peakRssKiB, processTreeRss(child.pid));
    } catch {}
  };
  const timer = setInterval(sample, 40);
  sample();
  const status = await new Promise((resolve) => child.on("exit", resolve));
  clearInterval(timer);
  sample();
  if (status !== 0) {
    process.stderr.write(output);
    throw new Error(`vitest exited ${status}`);
  }
  return {
    durationMs: Math.round(performance.now() - started),
    peakRssMiB: Math.round((peakRssKiB / 1024) * 10) / 10,
  };
}

const observations = [];
for (let index = 0; index < repetitions; index++) observations.push(await measure());
console.log(JSON.stringify({ config, observations }, null, 2));

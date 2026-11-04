// Runs package scripts concurrently, a few at a time, and reports each one's output as a
// block when it finishes.
//
//   node scripts/run-scripts.mjs [--jobs N] <script> [<script> ...]
//
// `test:native` was one `&&` chain of 35 Vitest processes. Most of them run a handful
// of files in a few seconds, so start-up dominated, and the Windows CI leg spent about
// three minutes on it. The scripts are independent: each Vitest run gets its own
// temporary root (tests/support/temp-root.global.ts), every write to the shared
// node_modules/.cache/vitest-native goes through a temporary file and a rename (the
// same guarantee concurrent workers already rely on), and the one global setup that
// writes into node_modules (tests-native/one-instance/packages.global.ts) writes
// package names no other script resolves. A script's own commands still run in order.
//
// Scripts start in the order given, so put the longest first. Every script runs even
// when another fails; the exit code is 1 if any failed. `--jobs 1` (or VN_TEST_JOBS=1)
// is the old sequential behaviour, for bisecting a suspected interaction.
import { spawn } from "node:child_process";
import os from "node:os";
import process from "node:process";

const args = process.argv.slice(2);
let jobs = Number(process.env.VN_TEST_JOBS) || 0;
const scripts = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--jobs") jobs = Number(args[++i]);
  else scripts.push(args[i]);
}
if (scripts.length === 0) {
  console.error("usage: run-scripts.mjs [--jobs N] <script> [<script> ...]");
  process.exit(2);
}
// Each Vitest run already starts workers for most of the machine, so a few at a time
// is enough to overlap start-up without starving the long runs (4-vCPU CI runners: 3).
if (!Number.isInteger(jobs) || jobs < 1)
  jobs = Math.max(1, Math.min(3, os.availableParallelism() - 1));

const github = process.env.GITHUB_ACTIONS === "true";
const children = new Set();
const results = [];

function run(script) {
  return new Promise((resolve) => {
    const started = Date.now();
    const chunks = [];
    const child = spawn("bun", ["run", script], {
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    let finished = false;
    const finish = (code, error) => {
      // A spawn failure emits `error` and may still emit `close`: report it once.
      if (finished) return;
      finished = true;
      children.delete(child);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const ok = code === 0;
      const title = `${ok ? "✓" : "✗"} ${script} (${seconds}s)`;
      process.stdout.write(github ? `::group::${title}\n` : `\n── ${title}\n`);
      process.stdout.write(Buffer.concat(chunks));
      if (error) process.stdout.write(`${error.stack ?? error}\n`);
      if (github) process.stdout.write("::endgroup::\n");
      if (!ok && github) process.stdout.write(`::error::${script} failed (exit ${code})\n`);
      results.push({ script, ok, seconds, code });
      resolve();
    };
    child.on("error", (error) => finish(1, error));
    child.on("close", (code) => finish(code ?? 1));
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
    process.exit(130);
  });
}

const started = Date.now();
const queue = [...scripts];
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length > 0) await run(queue.shift());
  }),
);

const failed = results.filter((result) => !result.ok);
console.log(
  `\n${scripts.length} scripts, ${jobs} at a time, ${((Date.now() - started) / 1000).toFixed(1)}s:`,
);
for (const { script, ok, seconds } of results)
  console.log(`  ${ok ? "✓" : "✗"} ${script} ${seconds}s`);
if (failed.length > 0) {
  console.log(`\n${failed.length} failed: ${failed.map((result) => result.script).join(", ")}`);
  process.exit(1);
}

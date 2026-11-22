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
// Scripts start in the order given. Do not start the long ones together: a deadline
// measures a script's wall time, and long scripts run side by side slow each other past
// it (scripts/ci/shard.mjs). Every script runs even when another fails; the exit code is
// 1 if any failed. With VN_SCRIPT_DEADLINE_MS set (CI sets it), a script still running
// at its deadline is stopped and fails with the test files it was running
// (scripts/ci/deadline.mjs), and its Vitest runs carry the no-progress reporter
// (scripts/ci/hang-reporter.mjs). VN_SCRIPT_DEADLINE_MS is the default; the long
// scripts have their own, from measured durations (scripts/ci/script-deadlines.mjs).
// `--jobs 1` (or VN_TEST_JOBS=1) is the old sequential behaviour, for bisecting a
// suspected interaction. `--shard k/n` (or VN_TEST_SHARD) runs only the k-th of n parts
// of the list (scripts/ci/shard.mjs), for a CI leg split across parallel jobs.
import os from "node:os";
import process from "node:process";
import { describeRunning, runWithDeadline } from "./ci/deadline.mjs";
import { SCRIPT_DEADLINES, deadlineFor } from "./ci/script-deadlines.mjs";
import { parseShard, scriptsInShard } from "./ci/shard.mjs";

const args = process.argv.slice(2);
let jobs = Number(process.env.VN_TEST_JOBS) || 0;
let shardSpec = process.env.VN_TEST_SHARD;
const listed = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--jobs") jobs = Number(args[++i]);
  else if (args[i] === "--shard") shardSpec = args[++i];
  else listed.push(args[i]);
}
if (listed.length === 0) {
  console.error("usage: run-scripts.mjs [--jobs N] [--shard k/n] <script> [<script> ...]");
  process.exit(2);
}
let shard;
try {
  shard = parseShard(shardSpec);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const scripts = scriptsInShard(listed, shard, Object.keys(SCRIPT_DEADLINES));
if (shard) {
  console.log(`shard ${shard.index}/${shard.count}: ${scripts.length} of ${listed.length} scripts`);
}
// Each Vitest run already starts workers for most of the machine, so a few at a time
// is enough to overlap start-up without starving the long runs (4-vCPU CI runners: 3).
if (!Number.isInteger(jobs) || jobs < 1)
  jobs = Math.max(1, Math.min(3, os.availableParallelism() - 1));

const github = process.env.GITHUB_ACTIONS === "true";
const defaultDeadlineMs = Number(process.env.VN_SCRIPT_DEADLINE_MS) || 0;
const results = [];

async function run(script) {
  const started = Date.now();
  const chunks = [];
  // No default deadline means none at all (a local run), not just the listed ones.
  const deadlineMs = defaultDeadlineMs && deadlineFor(script, defaultDeadlineMs);
  const { code, timedOut, running } = await runWithDeadline("bun", ["run", script], {
    deadlineMs,
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
    onOutput: (chunk) => chunks.push(chunk),
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = code === 0;
  const title = `${ok ? "✓" : "✗"} ${script} (${seconds}s)`;
  process.stdout.write(github ? `::group::${title}\n` : `\n── ${title}\n`);
  process.stdout.write(Buffer.concat(chunks));
  if (github) process.stdout.write("::endgroup::\n");
  if (timedOut) {
    const lines = [
      `${script} passed its ${deadlineMs / 1000} s deadline and was stopped.`,
      ...describeRunning(running),
    ];
    for (const line of lines) process.stdout.write(`${github ? "::error::" : "✗ "}${line}\n`);
  } else if (!ok && github) {
    process.stdout.write(`::error::${script} failed (exit ${code})\n`);
  }
  results.push({ script, ok, seconds, code });
}

// Ctrl-C or a cancelled job: each running script's process tree is stopped by its own
// handler (scripts/ci/deadline.mjs); exit once those have run.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => setImmediate(() => process.exit(130)));
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

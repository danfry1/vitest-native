// A file that leaves React's act() scope open must cost only itself under the hot runtime.
//
// React stays loaded across a hot worker's files, and an open act() scope lives in its
// module scope, where the per-file reset cannot reach. Every later render on the worker
// then queued inside it and never committed, so ordinary files failed with "Unable to
// find an element". Each case runs one leaking file, then 16 ordinary render files, and
// reads the JSON report per FILE (tests-native/vitest.hot-act-scope.config.mts):
//
//   timeout-pool     a test times out inside act(), two workers: that test fails and
//                    names the cause, the worker is retired, all 16 renders pass.
//   unawaited-pool   a passing test leaves an un-awaited act() open: every file passes,
//                    and the worker is retired.
//   late-batch       one worker, so no retirement; the timed-out act() finishes soon
//                    after, the next file waits for it, and all 16 renders pass.
//   timeout-batch    one worker and a scope that stays open: each later file fails
//                    naming the cause, not on its own render.
//   rejects-*        a passing test whose act() rejects leaves React's queue non-null
//                    with no scope open: no worker is retired, every file passes.
//   fake-timers-batch  the same as timeout-batch with fake timers (Date too) left on:
//                    the wait still ends.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const config = path.join("tests-native", "vitest.hot-act-scope.config.mts");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-hot-act-scope-"));
const RENDERS = 16;

function run(mode) {
  const report = path.join(outDir, `${mode}.json`);
  const result = spawnSync(
    process.execPath,
    [
      vitestEntry,
      "run",
      "--config",
      config,
      "--mode",
      mode,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${report}`,
    ],
    // A bound, so a wait that never ends fails this gate instead of hanging it.
    {
      cwd: packageRoot,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (!fs.existsSync(report)) throw new Error(`${mode}: no JSON report was written:\n${output}`);
  const json = JSON.parse(fs.readFileSync(report, "utf8"));
  const files = json.testResults.map((entry) => ({
    name: path.basename(entry.name),
    status: entry.status,
    // A file-level error (an import failure) and every test's failure messages.
    text: [entry.message, ...entry.assertionResults.flatMap((t) => t.failureMessages)].join("\n"),
  }));
  const renders = files.filter((file) => /^b\d+\.test\.tsx$/.test(file.name));
  const leak = files.find((file) => file.name.startsWith("a-"));
  if (renders.length !== RENDERS || !leak) {
    throw new Error(`${mode}: expected the leaking file and ${RENDERS} renders:\n${output}`);
  }
  return { mode, status: result.status, renders, leak, output };
}

function fail(result, why) {
  throw new Error(`${result.mode}: ${why}\n${result.output}`);
}

const NAMES_CAUSE = /act\(\) scope is still open \(react\.act-scope\)/;
const NAMES_UNUSABLE = /cannot run this file: React's act\(\) scope is still open/;
const RETIRED = /retiring a hot worker: React's act\(\) scope is still open/;

try {
  const timeout = run("timeout-pool");
  const broken = timeout.renders.filter((file) => file.status !== "passed");
  if (broken.length > 0) fail(timeout, `renders failed: ${broken.map((f) => f.name).join(", ")}`);
  if (timeout.leak.status !== "failed" || !NAMES_CAUSE.test(timeout.leak.text)) {
    fail(timeout, `the timed-out test must fail naming the open act() scope`);
  }
  if (!RETIRED.test(timeout.output)) fail(timeout, "the worker was not retired");
  console.log("[vitest-native] act scope: a timeout inside act() costs only its own test");

  const unawaited = run("unawaited-pool");
  if (unawaited.status !== 0) fail(unawaited, "every file must pass");
  if (!RETIRED.test(unawaited.output)) fail(unawaited, "the worker was not retired");
  console.log("[vitest-native] act scope: an un-awaited act() retires the worker, fails nothing");

  const late = run("late-batch");
  const lateBroken = late.renders.filter((file) => file.status !== "passed");
  if (lateBroken.length > 0) {
    fail(late, `renders failed: ${lateBroken.map((f) => f.name).join(", ")}`);
  }
  console.log("[vitest-native] act scope: one worker waits for a scope that closes by itself");

  const stuck = run("timeout-batch");
  const unnamed = stuck.renders.filter(
    (file) => file.status !== "failed" || !NAMES_UNUSABLE.test(file.text),
  );
  if (unnamed.length > 0) {
    fail(stuck, `files did not fail naming the cause: ${unnamed.map((f) => f.name).join(", ")}`);
  }
  console.log("[vitest-native] act scope: with one worker, later files fail naming the cause");

  // A rejected act() leaves React's queue non-null with no scope open: nothing to retire.
  for (const mode of ["rejects-pool", "rejects-batch"]) {
    const rejects = run(mode);
    if (rejects.status !== 0) fail(rejects, "every file must pass");
    if (RETIRED.test(rejects.output)) fail(rejects, "a worker was retired with no scope open");
  }
  console.log("[vitest-native] act scope: a rejected act() is not an open scope");

  // The wait must end even when the last file froze Date with fake timers.
  const frozen = run("fake-timers-batch");
  const frozenUnnamed = frozen.renders.filter(
    (file) => file.status !== "failed" || !NAMES_UNUSABLE.test(file.text),
  );
  if (frozenUnnamed.length > 0) {
    fail(
      frozen,
      `files did not fail naming the cause: ${frozenUnnamed.map((f) => f.name).join(", ")}`,
    );
  }
  console.log("[vitest-native] act scope: the one-worker wait ends under frozen fake timers");
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}

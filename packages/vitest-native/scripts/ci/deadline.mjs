// Run a command with a hard deadline, and say what its tests were doing if it passes it.
//
// The second layer of the hang guard (the first is scripts/ci/hang-reporter.mjs, inside
// Vitest). This one covers what a reporter cannot see: a main process that is itself
// stuck, a global setup that never returns, or a script that runs Vitest on its own. At
// the deadline the whole process tree gets SIGTERM, then SIGKILL 5 s later, and the
// progress log the reporter wrote says which files and tests were still running.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** What the progress log says was running at the end: file → test (or null). */
export function runningFromLog(logFile) {
  const running = new Map();
  let text;
  try {
    text = fs.readFileSync(logFile, "utf8");
  } catch {
    return running;
  }
  for (const line of text.split("\n")) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // A line cut short by the kill.
    }
    if (entry.event === "file-start") running.set(entry.file, null);
    else if (entry.event === "test-start") running.set(entry.file, entry.test);
    else if (entry.event === "test-end" && running.get(entry.file) === entry.test) {
      running.set(entry.file, null);
    } else if (entry.event === "file-end") running.delete(entry.file);
    // A later Vitest run in the same script starts with nothing running.
    else if (entry.event === "init" || entry.event === "run-end") running.clear();
  }
  return running;
}

/** Lines describing `running`, for the deadline's error. */
export function describeRunning(running) {
  if (running.size === 0)
    return ["No test file was running (setup, collection, or not a Vitest step)."];
  return [...running].map(([file, test]) =>
    test
      ? `Running: ${file} (test "${test}")`
      : `Running: ${file} (no test reported as running: a test whose start was not reported yet, a hook, or the file's imports)`,
  );
}

function killTree(child, signal) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    if (child.exitCode !== null) return;
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  // The whole group, even if the direct child has exited: a descendant that ignored
  // SIGTERM is still in it (ESRCH once the group is gone).
  try {
    process.kill(-child.pid, signal);
  } catch {}
}

/**
 * Run `command args`; under a deadline, with VN_HANG_GUARD=1 and a fresh progress log. Resolves to
 * `{ code, timedOut, running }`; `running` is set when the deadline killed it.
 * `deadlineMs` 0 or undefined means no deadline. Output goes to `stdio` (spawn's option)
 * or, with `onOutput`, to that callback.
 */
export function runWithDeadline(
  command,
  args,
  { deadlineMs, env = process.env, onOutput, cwd } = {},
) {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vn-progress-")), "progress.jsonl");
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      // Guarded only under a deadline: local runs without one are unchanged.
      env: deadlineMs > 0 ? { ...env, VN_HANG_GUARD: "1", VN_PROGRESS_LOG: log } : env,
      stdio: onOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      // Its own process group, so the deadline can stop the whole tree; only under a
      // deadline, so local runs still end with the terminal.
      detached: deadlineMs > 0 && process.platform !== "win32",
    });
    if (onOutput) {
      child.stdout.on("data", onOutput);
      child.stderr.on("data", onOutput);
    }
    let timedOut = false;
    let escalate;
    const timer =
      deadlineMs > 0
        ? setTimeout(() => {
            timedOut = true;
            killTree(child, "SIGTERM");
            escalate = setTimeout(() => killTree(child, "SIGKILL"), 5000);
          }, deadlineMs)
        : undefined;
    const forward = (signal) => killTree(child, signal);
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(escalate);
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      const running = timedOut ? runningFromLog(log) : null;
      fs.rmSync(path.dirname(log), { recursive: true, force: true });
      resolve({ code: timedOut ? 1 : (code ?? 1), timedOut, running });
    };
    child.on("error", () => finish(1));
    child.on("close", (code) => finish(code));
  });
}

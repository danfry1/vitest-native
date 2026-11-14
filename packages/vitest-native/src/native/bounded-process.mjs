// Shared parent-side controller for short-lived, memory-bounded helpers.
//
// Expensive toolchain/configuration modules must not become permanent members of
// Vite's main process merely because their result is needed once at startup. The
// child receives one JSON value in a file named by its first argument (readInput) and
// returns one JSON value over fd 3;
// stdout/stderr remain available to arbitrary user/toolchain code without being
// able to corrupt the protocol.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { suspendedNote, suspensionTracker } from "./suspension.mjs";

// The protocol channel carries the one answer and is capped strictly. stdout/stderr
// belong to arbitrary user and toolchain code, which may log freely: only a tail is
// kept, for the error message, and logging never kills the child.
const MAX_OUTPUT_BYTES = 1024 * 1024;
const LOG_TAIL_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const OOM_RE = /heap out of memory|reached heap limit|allocation failed.*heap/i;

// Refused (sandbox, platform) or exited: keep the default priority. Others throw.
const PRIORITY_REFUSED = new Set(["EACCES", "EPERM", "ESRCH", "ENOSYS"]);
export function lowerPriority(pid, priority, setPriority = os.setPriority) {
  try {
    setPriority(pid, priority);
    return true;
  } catch (error) {
    if (!PRIORITY_REFUSED.has(error?.info?.code)) throw error;
    return false;
  }
}

/** The helper's side: the JSON value its parent wrote for it. */
export function readInput(argv = process.argv) {
  return JSON.parse(fs.readFileSync(argv[2], "utf8"));
}

/**
 * Writes a helper's input to a file of its own in `dir`, read by the helper by path.
 *
 * Not stdin: the parent would end it with a write and a shutdown request, and a pending
 * request holds this process's event loop open. On Windows a pipe's shutdown is a flush
 * that waits until the reader has drained the pipe or is gone, and closing the pipe does
 * not cancel it: a helper stopped before it read its input (one still starting on a
 * loaded machine) kept a cancelled run from exiting for seconds. A file involves no
 * request to the child. Created exclusively under a random name, so concurrent workers
 * never share one.
 */
function writeInput(dir, label, input) {
  const inputDir = path.join(dir, "helper-input");
  fs.mkdirSync(inputDir, { recursive: true });
  removeOrphanedInputs(inputDir);
  const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const file = path.join(inputDir, `${slug}-${process.pid}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(file, JSON.stringify(input), { flag: "wx", mode: 0o600 });
  return file;
}

const INPUT_NAME = /-(\d+)-[0-9a-f-]{36}\.json$/;

/**
 * Removes input files whose writer has died: a run killed outright (SIGKILL, a closed
 * terminal) cannot run the removal its helper's end would have. A process that exists
 * but cannot be signalled (EPERM) is still alive.
 */
function removeOrphanedInputs(inputDir) {
  let names;
  try {
    names = fs.readdirSync(inputDir);
  } catch {
    return;
  }
  for (const name of names) {
    const pid = Number(name.match(INPUT_NAME)?.[1]);
    if (!pid || pid === process.pid) continue;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") removeInput(path.join(inputDir, name));
    }
  }
}

function removeInput(file) {
  // A helper killed on Windows may still hold it for a moment.
  fs.rmSync(file, { force: true, maxRetries: 5, retryDelay: 50 });
}

function attempt(
  entryFile,
  inputFile,
  heapMb,
  spawnProcess,
  timeoutMs,
  label,
  signal,
  priority,
  unref,
) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, oom: false, cancelled: true, error: `${label} was cancelled`, heapMb });
      return;
    }
    let child;
    try {
      child = spawnProcess(
        process.execPath,
        [`--max-old-space-size=${heapMb}`, entryFile, inputFile],
        { stdio: ["ignore", "pipe", "pipe", "pipe"], windowsHide: true },
      );
    } catch (error) {
      resolve({
        ok: false,
        oom: false,
        error: error instanceof Error ? error.message : String(error),
        heapMb,
      });
      return;
    }

    // A background helper must not keep this process alive by itself: if everything
    // else is done, the process exits and its exit hook stops the helper.
    if (unref) {
      child.unref?.();
      for (const stream of child.stdio ?? []) stream?.unref?.();
    }

    // A background helper yields the CPU to the work it runs beside.
    if (priority !== undefined && child.pid !== undefined) {
      try {
        lowerPriority(child.pid, priority);
      } catch (error) {
        child.kill("SIGKILL");
        throw error;
      }
    }

    let stdout = "";
    let stderr = "";
    let protocol = "";
    let outputBytes = 0;
    let overflow = false;
    let settled = false;
    let timer;
    // The timeout counts the helper's run, not time the machine spends asleep
    // (suspension.mjs): a timer alone would fire on wake, mid-run (#689).
    const pollMs = Math.min(1000, timeoutMs);
    const started = performance.now();
    const suspension = suspensionTracker({ intervalMs: pollMs });
    const onAbort = () => {
      child.kill("SIGKILL");
      finish({ ok: false, oom: false, cancelled: true, error: `${label} was cancelled`, heapMb });
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      // A failure says when the machine slept meanwhile: what looked like a slow helper
      // was a suspended one.
      if (!result.ok && typeof result.error === "string") {
        result = { ...result, error: result.error + suspendedNote(suspension.suspendedMs) };
      }
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const appendProtocol = (current, chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        overflow = true;
        child.kill("SIGKILL");
        finish({
          ok: false,
          oom: false,
          error: `${label} output exceeded 1 MiB`,
          heapMb,
        });
        return current;
      }
      return current + chunk;
    };
    // Truncated tails start at a line boundary, so the first line an error message
    // quotes is a whole one.
    const appendLog = (current, chunk) => {
      const next = current + chunk;
      if (next.length <= LOG_TAIL_BYTES) return next;
      const tail = next.slice(-LOG_TAIL_BYTES);
      const lineStart = tail.indexOf("\n");
      return lineStart === -1 ? tail : tail.slice(lineStart + 1);
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdio?.[3]?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout = appendLog(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendLog(stderr, chunk);
    });
    child.stdio?.[3]?.on("data", (chunk) => {
      protocol = appendProtocol(protocol, chunk);
    });
    child.on("error", (error) => {
      finish({ ok: false, oom: false, error: error.message, heapMb });
    });
    child.on("close", (code, exitSignal) => {
      if (settled) return;
      const oom = OOM_RE.test(stderr);
      if (overflow) {
        finish({ ok: false, oom: false, error: `${label} output exceeded 1 MiB`, heapMb });
        return;
      }
      let response = null;
      try {
        response = JSON.parse(protocol);
      } catch {}
      if (code === 0 && response?.ok === true) {
        finish({ ...response, heapMb });
        return;
      }
      finish({
        ok: false,
        oom,
        heapMb,
        error:
          response?.error ||
          stderr.trim().split("\n")[0] ||
          stdout.trim().split("\n")[0] ||
          `${label} exited ${code ?? `on ${exitSignal ?? "an unknown signal"}`}`,
      });
    });
    timer = setInterval(() => {
      suspension.tick();
      if (performance.now() - started - suspension.suspendedMs <= timeoutMs) return;
      child.kill("SIGKILL");
      finish({
        ok: false,
        oom: false,
        heapMb,
        error: `${label} exceeded ${timeoutMs}ms`,
      });
    }, pollMs);
    timer.unref?.();
  });
}

/** Run once at the initial heap cap, retrying only for a genuine V8 heap OOM. */
export async function runBoundedProcess(
  entryFile,
  input,
  {
    initialHeapMb,
    retryHeapMb,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    spawnProcess = spawn,
    label = "helper",
    // Aborting kills the child and resolves with `cancelled: true`.
    signal,
    // os.setPriority value for the child (19 is the lowest priority).
    priority,
    // Let this process exit while the child runs (the child's timer is unref'd too).
    unref = false,
    // Where the input file is written: the project's cache directory (cacheRootFor), on
    // the project's volume rather than the system temporary directory.
    inputDir = os.tmpdir(),
  },
) {
  let inputFile;
  try {
    inputFile = writeInput(inputDir, label, input);
  } catch (error) {
    return {
      ok: false,
      oom: false,
      error: `${label} input could not be written: ${error instanceof Error ? error.message : String(error)}`,
      attempts: 0,
    };
  }
  try {
    const run = (heapMb) =>
      attempt(
        entryFile,
        inputFile,
        heapMb,
        spawnProcess,
        timeoutMs,
        label,
        signal,
        priority,
        unref,
      );
    const first = await run(initialHeapMb);
    if (first.ok || !first.oom || retryHeapMb <= initialHeapMb) {
      return { ...first, attempts: 1 };
    }
    const retry = await run(retryHeapMb);
    return { ...retry, attempts: 2 };
  } finally {
    removeInput(inputFile);
  }
}

export const boundedProcessDefaults = Object.freeze({
  maxOutputBytes: MAX_OUTPUT_BYTES,
  timeoutMs: DEFAULT_TIMEOUT_MS,
});

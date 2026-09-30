// Shared parent-side controller for short-lived, memory-bounded helpers.
//
// Expensive toolchain/configuration modules must not become permanent members of
// Vite's main process merely because their result is needed once at startup. The
// child receives one JSON value on stdin and returns one JSON value over fd 3;
// stdout/stderr remain available to arbitrary user/toolchain code without being
// able to corrupt the protocol.
import { spawn } from "node:child_process";

// The protocol channel carries the one answer and is capped strictly. stdout/stderr
// belong to arbitrary user and toolchain code, which may log freely: only a tail is
// kept, for the error message, and logging never kills the child.
const MAX_OUTPUT_BYTES = 1024 * 1024;
const LOG_TAIL_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const OOM_RE = /heap out of memory|reached heap limit|allocation failed.*heap/i;

function attempt(entryFile, input, heapMb, spawnProcess, timeoutMs, label) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(process.execPath, [`--max-old-space-size=${heapMb}`, entryFile], {
        stdio: ["pipe", "pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        ok: false,
        oom: false,
        error: error instanceof Error ? error.message : String(error),
        heapMb,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let protocol = "";
    let outputBytes = 0;
    let overflow = false;
    let settled = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
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
    // A helper may exit before draining input. EPIPE is emitted asynchronously;
    // catching stdin.end() does not catch it. The close event reports the cause.
    child.stdin?.on("error", () => {});
    child.on("close", (code, signal) => {
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
          `${label} exited ${code ?? `on ${signal ?? "an unknown signal"}`}`,
      });
    });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        oom: false,
        heapMb,
        error: `${label} exceeded ${timeoutMs}ms`,
      });
    }, timeoutMs);
    timer.unref?.();
    try {
      child.stdin?.end(JSON.stringify(input));
    } catch (error) {
      child.kill("SIGKILL");
      finish({
        ok: false,
        oom: false,
        heapMb,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
  },
) {
  const first = await attempt(entryFile, input, initialHeapMb, spawnProcess, timeoutMs, label);
  if (first.ok || !first.oom || retryHeapMb <= initialHeapMb) {
    return { ...first, attempts: 1 };
  }
  const retry = await attempt(entryFile, input, retryHeapMb, spawnProcess, timeoutMs, label);
  return { ...retry, attempts: 2 };
}

export const boundedProcessDefaults = Object.freeze({
  maxOutputBytes: MAX_OUTPUT_BYTES,
  timeoutMs: DEFAULT_TIMEOUT_MS,
});

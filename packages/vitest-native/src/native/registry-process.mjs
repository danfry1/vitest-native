// Parent-side controller for bounded cold registry compilation.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { _warnRegistryUnavailable, buildRegistry } from "./registry.mjs";

const INITIAL_HEAP_MB = 96;
const RETRY_HEAP_MB = 256;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const OOM_RE = /heap out of memory|reached heap limit|allocation failed.*heap/i;

function compilerAttempt(compilerFile, options, heapMb, spawnProcess, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(
        process.execPath,
        [`--max-old-space-size=${heapMb}`, compilerFile],
        // fd 3 is a private protocol channel. Babel and user-supplied plugins are
        // allowed to write to stdout/stderr without corrupting the JSON result.
        { stdio: ["pipe", "pipe", "pipe", "pipe"], windowsHide: true },
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
    const append = (current, chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        overflow = true;
        child.kill("SIGKILL");
        finish({
          ok: false,
          oom: false,
          error: "compiler output exceeded 1 MiB",
          heapMb,
        });
        return current;
      }
      return current + chunk;
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdio?.[3]?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.stdio?.[3]?.on("data", (chunk) => {
      protocol = append(protocol, chunk);
    });
    child.on("error", (error) => {
      finish({ ok: false, oom: false, error: error.message, heapMb });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      const oom = OOM_RE.test(stderr);
      if (overflow) {
        finish({ ok: false, oom: false, error: "compiler output exceeded 1 MiB", heapMb });
        return;
      }
      let response = null;
      try {
        response = JSON.parse(protocol);
      } catch {}
      if (code === 0 && response?.ok === true && typeof response.registryFile === "string") {
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
          `compiler exited ${code ?? `on ${signal ?? "an unknown signal"}`}`,
      });
    });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        oom: false,
        heapMb,
        error: `compiler exceeded ${timeoutMs}ms`,
      });
    }, timeoutMs);
    timer.unref?.();
    try {
      child.stdin?.end(JSON.stringify(options));
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

/** Compile once at 96 MiB, retrying at 256 MiB only for a genuine V8 heap OOM. */
export async function compileRegistryInChild(
  compilerFile,
  options,
  {
    initialHeapMb = INITIAL_HEAP_MB,
    retryHeapMb = RETRY_HEAP_MB,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    spawnProcess = spawn,
  } = {},
) {
  const first = await compilerAttempt(
    compilerFile,
    options,
    initialHeapMb,
    spawnProcess,
    timeoutMs,
  );
  if (first.ok || !first.oom || retryHeapMb <= initialHeapMb) {
    return { ...first, attempts: 1 };
  }
  const retry = await compilerAttempt(compilerFile, options, retryHeapMb, spawnProcess, timeoutMs);
  return { ...retry, attempts: 2 };
}

export const registryCompilerDefaults = Object.freeze({
  initialHeapMb: INITIAL_HEAP_MB,
  retryHeapMb: RETRY_HEAP_MB,
  timeoutMs: DEFAULT_TIMEOUT_MS,
});

/**
 * Resolve a warm registry in the parent, or compile a cache miss in the bounded
 * child. The optional compiler is a test seam proving warm production lookups do
 * not spawn; ordinary callers always use compileRegistryInChild.
 */
export async function buildRegistryFor(options, compiler = compileRegistryInChild) {
  try {
    // Preserve the explicit escape hatch's existing diagnostic and silence
    // contracts, and avoid launching a process for work the user disabled.
    if (process.env.VITEST_NATIVE_NO_REGISTRY === "1") {
      return buildRegistry(options);
    }

    // A warm run is just the cache key + manifest stats in this process. In
    // particular, it never initializes Babel and never launches a child.
    const cached = buildRegistry({ ...options, cacheOnly: true, failOnError: true });
    if (cached) return cached;

    const result = await compiler(
      fileURLToPath(new URL("./registry-compiler.mjs", import.meta.url)),
      options,
    );

    // Validate through the same cache contract every reader uses instead of
    // trusting a path returned over the child protocol. This also turns a losing
    // compiler in a concurrent cold-cache race into success once the winner's
    // atomic metadata write becomes visible (notably on Windows, where rename
    // cannot replace an existing target).
    let registryFile = buildRegistry({
      ...options,
      cacheOnly: true,
      failOnError: true,
      diagnostics: false,
    });
    if (!registryFile && !result.ok) {
      for (const delayMs of [10, 20, 40, 80]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        registryFile = buildRegistry({
          ...options,
          cacheOnly: true,
          failOnError: true,
          diagnostics: false,
        });
        if (registryFile) break;
      }
    }
    if (registryFile) {
      if (options.diagnostics) {
        if (result.ok) {
          const count = typeof result.count === "number" ? `${result.count} modules, ` : "";
          const duration = typeof result.durationMs === "number" ? `${result.durationMs}ms, ` : "";
          const rss =
            typeof result.rss === "number"
              ? `${Math.ceil(result.rss / 1024 / 1024)} MiB RSS, `
              : "";
          console.log(
            `[vitest-native] (native) precompiled RN registry in a bounded child ` +
              `(${count}${duration}${rss}${result.heapMb} MiB heap cap, ` +
              `${result.attempts} attempt${result.attempts === 1 ? "" : "s"})`,
          );
        } else {
          console.log(
            `[vitest-native] (native) reused a registry published by a concurrent compiler ` +
              `(local compiler: ${result.error ?? "unknown failure"})`,
          );
        }
      }
      return registryFile;
    }

    _warnRegistryUnavailable(
      result.error ?? "bounded compiler completed without a usable cache entry",
    );
    return null;
  } catch (error) {
    _warnRegistryUnavailable(error?.message ?? error);
    return null;
  }
}

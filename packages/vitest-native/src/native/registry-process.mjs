// Parent-side controller for bounded cold registry compilation.
import { fileURLToPath } from "node:url";
import { _warnRegistryUnavailable, buildRegistry } from "./registry.mjs";
import { runBoundedProcess } from "./bounded-process.mjs";

const INITIAL_HEAP_MB = 96;
const RETRY_HEAP_MB = 256;
const DEFAULT_TIMEOUT_MS = 120_000;

/** Compile once at 96 MiB, retrying at 256 MiB only for a genuine V8 heap OOM. */
export async function compileRegistryInChild(
  compilerFile,
  options,
  {
    initialHeapMb = INITIAL_HEAP_MB,
    retryHeapMb = RETRY_HEAP_MB,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    spawnProcess,
  } = {},
) {
  const result = await runBoundedProcess(compilerFile, options, {
    initialHeapMb,
    retryHeapMb,
    timeoutMs,
    spawnProcess,
    label: "compiler",
  });
  if (result.ok && typeof result.registryFile !== "string") {
    return {
      ok: false,
      oom: false,
      error: "compiler returned no registry file",
      heapMb: result.heapMb,
      attempts: result.attempts,
    };
  }
  return result;
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

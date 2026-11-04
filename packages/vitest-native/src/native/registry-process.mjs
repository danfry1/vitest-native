// Parent-side controller for bounded cold registry compilation.
import { fileURLToPath } from "node:url";
import { _warnRegistryUnavailable, buildLibraryRegistry, buildRegistry } from "./registry.mjs";
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
 * The published registries for `options`, read through the cache contract every
 * reader uses (key + manifest), without building anything. `complete` is false when
 * React Native's registry or a requested library registry is missing.
 */
function cachedRegistries(options) {
  const registry = buildRegistry({
    ...options,
    cacheOnly: true,
    failOnError: true,
    diagnostics: false,
  });
  if (!registry) return { registry: null, libraryRegistry: null, complete: false };
  const wantsLibrary = (options.libraryEntries?.length ?? 0) > 0;
  if (!wantsLibrary) return { registry, libraryRegistry: null, complete: true };
  try {
    const libraryRegistry = buildLibraryRegistry({
      ...options,
      cacheOnly: true,
      failOnError: true,
      diagnostics: false,
    });
    return { registry, libraryRegistry, complete: libraryRegistry !== null };
  } catch (error) {
    // Entries that do not resolve, or a build of these inputs that failed before: a
    // build would fail the same way. React Native's registry stays in use.
    const reason = String(error?.message ?? error).replace(/^\[vitest-native\] /, "");
    return {
      registry,
      libraryRegistry: null,
      complete: true,
      libraryError: `library registry: ${reason}`,
    };
  }
}

/**
 * Resolve warm registries in the parent, or compile a cache miss in the bounded
 * child: React Native's registry and, when `libraryEntries` names any, the library
 * registry layered on it — one build lifecycle for both. Returns
 * `{ registry, libraryRegistry }`, or null without a React Native registry. A
 * library registry that cannot be built leaves `libraryRegistry` null and React
 * Native's registry in use. The optional compiler is a test seam proving warm
 * production lookups do not spawn; ordinary callers always use
 * compileRegistryInChild.
 */
export async function buildRegistryFor(options, compiler = compileRegistryInChild) {
  try {
    // Preserve the explicit escape hatch's existing diagnostic and silence
    // contracts, and avoid launching a process for work the user disabled.
    if (process.env.VITEST_NATIVE_NO_REGISTRY === "1") {
      buildRegistry(options);
      return null;
    }

    // A warm run is just the cache keys + manifest stats in this process. In
    // particular, it never initializes Babel and never launches a child.
    const warm = cachedRegistries(options);
    if (warm.complete) {
      if (warm.libraryError) _warnRegistryUnavailable(warm.libraryError);
      return { registry: warm.registry, libraryRegistry: warm.libraryRegistry };
    }

    const result = await compiler(
      fileURLToPath(new URL("./registry-compiler.mjs", import.meta.url)),
      options,
    );

    // Validate through the same cache contract every reader uses instead of
    // trusting a path returned over the child protocol. This also turns a losing
    // compiler in a concurrent cold-cache race into success once the winner's
    // atomic metadata write becomes visible (notably on Windows, where rename
    // cannot replace an existing target).
    let built = cachedRegistries(options);
    if (!built.complete && !result.ok) {
      for (const delayMs of [10, 20, 40, 80]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        built = cachedRegistries(options);
        if (built.complete) break;
      }
    }
    if (built.registry) {
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
      if (built.libraryError) _warnRegistryUnavailable(built.libraryError);
      else if (!built.complete) {
        _warnRegistryUnavailable(
          `library registry: ${result.libraryError ?? result.error ?? "bounded compiler completed without a usable cache entry"}`,
        );
      }
      return { registry: built.registry, libraryRegistry: built.libraryRegistry };
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

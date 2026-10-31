// Parent-side controller for bounded cold registry compilation.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { _warnRegistryUnavailable, buildRegistry, registryLocation } from "./registry.mjs";
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
    signal,
    priority,
  } = {},
) {
  const result = await runBoundedProcess(compilerFile, options, {
    initialHeapMb,
    retryHeapMb,
    timeoutMs,
    spawnProcess,
    signal,
    priority,
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

const COMPILER_FILE = () => fileURLToPath(new URL("./registry-compiler.mjs", import.meta.url));

/** Validate through the cache contract every reader uses, never the child's word. */
function validatedRegistry(options) {
  return buildRegistry({ ...options, cacheOnly: true, failOnError: true, diagnostics: false });
}

/**
 * The compiler's priority when it runs beside the tests: the lowest, so it takes only
 * CPU the workers leave idle and never slows the run it is building for.
 */
const BACKGROUND_PRIORITY = 19;

/**
 * Background builds in flight in this process, by registry file: every project and
 * every config reload that misses the same cache entry joins one compiler.
 */
const inFlight = new Map();
let exitHookInstalled = false;

/**
 * Resolve a warm registry, or start compiling a cache miss WITHOUT waiting for it.
 *
 * Why: a cold registry build takes seconds (about 2.5 s on an M-series Mac for React
 * Native 0.81), and waiting for it in config() put all of that ahead of the first test
 * file. Loading React Native file by file is the same React Native (the registry and the
 * per-file hooks run each module with Node's semantics and report the same frames), so a
 * cold run can start at once and use the registry as soon as it lands. The hot runtime
 * still waits (plugin.ts): a hot worker keeps React Native resident from its first file.
 *
 * Rejected:
 *   - a detached child that outlives the run: it competes with the workers, and it
 *     breaks the rule that nothing vitest-native starts outlives Vitest;
 *   - building in teardown: the whole build lands at the end of the cold run, slower
 *     than building first;
 *   - building in parallel but only for the next run: a large cold suite (CI without a
 *     cache) would load React Native file by file for every file, which costs more than
 *     the build once a suite passes roughly thirty files per worker.
 * So workers pick the registry up mid-run (activeRegistry in context.mjs).
 *
 *
 * A warm hit returns `{ registry }`, exactly as buildRegistryFor does. A miss returns
 * `{ pending }`: the registry file and the mtime its metadata had before the lookup (0
 * when absent), which is how a worker that starts later recognises a registry published
 * since (activeRegistry in context.mjs). The compiler is the same bounded child
 * buildRegistryFor uses, at the lowest CPU priority; settleRegistryBuilds ends it, and
 * so does this process exiting. Returns `{}` when no registry can be had at all.
 */
export function startRegistryBuild(options, compiler = compileRegistryInChild) {
  try {
    if (process.env.VITEST_NATIVE_NO_REGISTRY === "1") return { registry: buildRegistry(options) };
    const { registryFile, metaFile } = registryLocation(options);
    const joined = inFlight.get(registryFile);
    if (joined) return { pending: joined.pending };
    // Read before the lookup: a registry published between the two then still
    // differs from `since`, so it is found rather than missed.
    let since = 0;
    try {
      since = fs.statSync(metaFile).mtimeMs;
    } catch {}
    const cached = buildRegistry({ ...options, cacheOnly: true, failOnError: true });
    if (cached) return { registry: cached };

    const controller = new AbortController();
    const started = performance.now();
    const done = (async () => {
      try {
        const result = await compiler(COMPILER_FILE(), options, {
          signal: controller.signal,
          priority: BACKGROUND_PRIORITY,
        });
        // A concurrent run's compiler may have published it instead.
        const file = validatedRegistry(options);
        if (file) {
          if (options.diagnostics) {
            console.log(
              `[vitest-native] (native) precompiled RN registry in the background ` +
                `(${Math.round(performance.now() - started)}ms); test files that start ` +
                `from now on use it`,
            );
          }
          return file;
        }
        if (!result.cancelled) {
          _warnRegistryUnavailable(
            result.error ?? "bounded compiler completed without a usable cache entry",
          );
        }
        return null;
      } catch (error) {
        _warnRegistryUnavailable(error?.message ?? error);
        return null;
      } finally {
        inFlight.delete(registryFile);
      }
    })();
    const build = {
      pending: { file: registryFile, since },
      done,
      cancel: () => controller.abort(),
    };
    inFlight.set(registryFile, build);
    if (!exitHookInstalled) {
      exitHookInstalled = true;
      // Whatever ends this process (a signal Vitest turns into process.exit, an
      // uncaught error) takes the compiler with it: nothing outlives the run.
      process.once("exit", () => {
        for (const running of inFlight.values()) running.cancel();
      });
    }
    if (options.diagnostics) {
      console.log(
        `[vitest-native] (native) no precompiled RN registry for this graph yet; compiling ` +
          `it in the background while test files load React Native file by file`,
      );
    }
    return { pending: build.pending };
  } catch (error) {
    _warnRegistryUnavailable(error?.message ?? error);
    return {};
  }
}

/** Stop every build still running, as when the run is cancelled (Ctrl-C in a terminal). */
export async function stopRegistryBuilds() {
  const builds = [...inFlight.values()];
  for (const build of builds) build.cancel();
  await Promise.all(builds.map((build) => build.done));
}

/** Whether `env` describes a CI run, in the spelling CI providers and std-env use. */
function isCI(env) {
  return env.CI !== undefined && !["", "0", "false"].includes(env.CI.toLowerCase());
}

/**
 * Called when Vitest closes. A registry still compiling gets the rest of `budgetMs` to
 * finish, so the next run starts warm, and is stopped after that. On CI it is stopped
 * at once: a CI machine rarely keeps the cache, and a run that ended before it could
 * use the registry must not wait for one only a later run could use. Resolves once
 * every compiler has exited.
 */
export async function settleRegistryBuilds(budgetMs, env = process.env) {
  const builds = [...inFlight.values()];
  if (builds.length === 0) return;
  const waitMs = isCI(env) ? 0 : Math.max(0, budgetMs);
  if (waitMs > 0) {
    let timer;
    await Promise.race([
      Promise.all(builds.map((build) => build.done)),
      new Promise((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
    clearTimeout(timer);
  }
  // Only what is still running: a finished build has left inFlight.
  for (const build of builds) if (inFlight.get(build.pending.file) === build) build.cancel();
  await Promise.all(builds.map((build) => build.done));
}

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

    const result = await compiler(COMPILER_FILE(), options);

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

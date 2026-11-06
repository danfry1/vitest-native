// Parent-side controller for bounded cold registry compilation.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  _warnRegistryUnavailable,
  buildLibraryRegistry,
  buildRegistry,
  registryLocation,
} from "./registry.mjs";
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
    unref,
  } = {},
) {
  const result = await runBoundedProcess(compilerFile, options, {
    initialHeapMb,
    retryHeapMb,
    timeoutMs,
    spawnProcess,
    signal,
    priority,
    unref,
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

// Test seam: `wait` (as registryBuild: 'wait'); `compilerDelayMs` holds the compiler.
let seams = {};
export function _setRegistryBuildOptions(options = {}) {
  seams = options;
}
export function registryWaitForced() {
  return seams.wait === true;
}
function compilerInput(options) {
  return seams.compilerDelayMs > 0 ? { ...options, testDelayMs: seams.compilerDelayMs } : options;
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
 * Signals that end this process while a build runs. Vitest handles SIGINT and SIGTERM
 * itself during a run (and turns them into process.exit, which the exit hook covers),
 * but removes its handlers when it starts to close, and a signal while close waits for
 * the build would otherwise kill this process and leave the compiler running.
 */
const STOP_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
let signalHandlersInstalled = false;

function onStopSignal(signal) {
  // Installed first (prependListener), so this sees whether anything else will handle
  // the signal: Vitest during a run, whose own handler then ends the process gracefully.
  const handledElsewhere = process.listenerCount(signal) > 1;
  for (const running of inFlight.values()) running.cancel();
  removeSignalHandlers();
  // Otherwise the signal does what it would have done without this handler.
  if (!handledElsewhere) process.kill(process.pid, signal);
}

function installSignalHandlers() {
  if (signalHandlersInstalled || process.platform === "win32") return;
  signalHandlersInstalled = true;
  for (const signal of STOP_SIGNALS) process.prependListener(signal, onStopSignal);
}

function removeSignalHandlers() {
  if (!signalHandlersInstalled) return;
  signalHandlersInstalled = false;
  for (const signal of STOP_SIGNALS) process.off(signal, onStopSignal);
}

/**
 * Resolve a warm registry, or start compiling a cache miss without waiting for it.
 *
 * Loading React Native file by file runs the same modules with the same semantics, so
 * a cold run can start at once and use the registry when it lands; the plugin still
 * waits under the hot runtime, on CI and with registryBuild: 'wait'. Rejected: a
 * detached child (it outlives the run), building in teardown (slower than building
 * first), and building only for the next run (a large cold suite would load React
 * Native file by file throughout, which costs more than the build past roughly thirty
 * files per worker). So workers pick it up mid-run (activeRegistry in context.mjs).
 *
 * Returns `{ registry, libraryRegistry }` on a hit; on a miss `{ pending: { file, since } }`,
 * `since` being the metadata's mtime before the lookup (0 when absent); `{}` when no
 * registry can be had. settleRegistryBuilds, a stop signal or this process exiting ends it.
 *
 * The library registry (`libraryEntries`) compiles in the same child, after React
 * Native's. A run picks up React Native's registry mid-run, and the library registry
 * from the next run: until then those libraries load file by file, as they do when it
 * cannot be built. When React Native's registry is warm and only the library registry
 * is missing, it returns `{ wait: true }`: that build is a fraction of React Native's,
 * so the caller builds it first (buildRegistryFor) rather than run without it.
 */
export function startRegistryBuild(options, compiler = compileRegistryInChild) {
  try {
    if (process.env.VITEST_NATIVE_NO_REGISTRY === "1") {
      buildRegistry(options);
      return {};
    }
    const location = registryLocation(options);
    const { registryFile, metaFile } = location;
    const joined = inFlight.get(registryFile);
    if (joined) return { pending: joined.pending };
    // Before the lookup, so a registry published in between still differs from `since`.
    const since = fs.statSync(metaFile, { throwIfNoEntry: false })?.mtimeMs ?? 0;
    const warm = cachedRegistries(options, location);
    if (warm.complete) {
      if (warm.libraryError) _warnRegistryUnavailable(warm.libraryError);
      return { registry: warm.registry, libraryRegistry: warm.libraryRegistry };
    }
    if (warm.registry) return { wait: true };

    const controller = new AbortController();
    const started = performance.now();
    const done = (async () => {
      try {
        const result = await compiler(COMPILER_FILE(), compilerInput(options), {
          signal: controller.signal,
          priority: BACKGROUND_PRIORITY,
          // Never what keeps a finished run alive; settleRegistryBuilds waits for it
          // explicitly, and the exit hook stops it.
          unref: true,
        });
        // A concurrent run's compiler may have published it instead, visible a moment
        // later where rename cannot replace a file (Windows), as in buildRegistryFor.
        let built = cachedRegistries(options, location);
        if (!built.complete && !result.ok && !result.cancelled) {
          for (const delayMs of [10, 20, 40, 80]) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            built = cachedRegistries(options, location);
            if (built.complete) break;
          }
        }
        if (built.registry) {
          if (options.diagnostics) {
            console.log(
              `[vitest-native] (native) precompiled RN registry in the background ` +
                `(${Math.round(performance.now() - started)}ms); test files that start ` +
                `from now on use it`,
            );
          }
          if (built.libraryError) _warnRegistryUnavailable(built.libraryError);
          else if (!built.complete && !result.cancelled) {
            _warnRegistryUnavailable(
              `library registry: ${result.libraryError ?? result.error ?? "bounded compiler completed without a usable cache entry"}`,
            );
          }
          return { registry: built.registry, libraryRegistry: built.libraryRegistry };
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
        if (inFlight.size === 0) removeSignalHandlers();
      }
    })();
    const build = {
      pending: { file: registryFile, since },
      done,
      cancel: () => controller.abort(),
    };
    inFlight.set(registryFile, build);
    installSignalHandlers();
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

/**
 * Called when Vitest closes. A registry still compiling gets up to `budgetMs` to
 * finish, so the next run starts warm, and is stopped after that. It is stopped at once
 * when the last run ended cancelled (`--bail`, Ctrl-C in a terminal); a watch-mode
 * cancel does not close, so the build keeps running for the reruns.
 * Resolves once every compiler has exited.
 */
export async function settleRegistryBuilds(budgetMs, { cancelled = false } = {}) {
  const builds = [...inFlight.values()];
  if (builds.length === 0) return;
  const waitMs = cancelled ? 0 : Math.max(0, budgetMs);
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
  // The compilers are unref'd; hold the process open until they have gone, so the rest
  // of Vitest's close still runs.
  const keepAlive = setTimeout(() => {}, 10_000);
  await Promise.all(builds.map((build) => build.done));
  clearTimeout(keepAlive);
}

/**
 * A CI run: `CI` set to anything but "false", or, unless `CI=false`, one of these
 * providers' own variables set. Only decides whether a cold run waits for the registry.
 */
export const CI_VARIABLES = Object.freeze([
  "CI",
  "CONTINUOUS_INTEGRATION",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "BUILDKITE",
  "CIRCLECI",
  "TF_BUILD",
  "JENKINS_URL",
  "TEAMCITY_VERSION",
  "TRAVIS",
  "APPVEYOR",
  "CODEBUILD_BUILD_ID",
  "BITBUCKET_BUILD_NUMBER",
]);

export function isCI(env = process.env) {
  if (env.CI === "false") return false;
  return CI_VARIABLES.some((name) => env[name] !== undefined && env[name] !== "");
}

/**
 * The published registries for `options`, read through the cache contract every
 * reader uses (key + manifest), without building anything. `complete` is false when
 * React Native's registry or a requested library registry is missing.
 */
function cachedRegistries(options, location) {
  const registry = buildRegistry({
    ...options,
    location,
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
    const location = registryLocation(options);
    const warm = cachedRegistries(options, location);
    if (warm.complete) {
      if (warm.libraryError) _warnRegistryUnavailable(warm.libraryError);
      return { registry: warm.registry, libraryRegistry: warm.libraryRegistry };
    }

    // A background build of the same entry is already running in this process (another
    // project in the run, or a config reload): wait for it instead of compiling twice.
    // It was started for its own project's library entries, so read the cache for these
    // options afterwards, and compile what is still missing.
    const joined = inFlight.get(location.registryFile);
    if (joined) {
      await joined.done;
      const after = cachedRegistries(options, location);
      if (after.complete) {
        if (after.libraryError) _warnRegistryUnavailable(after.libraryError);
        return { registry: after.registry, libraryRegistry: after.libraryRegistry };
      }
    }

    const result = await compiler(COMPILER_FILE(), compilerInput(options));

    // Validate through the same cache contract every reader uses instead of
    // trusting a path returned over the child protocol. This also turns a losing
    // compiler in a concurrent cold-cache race into success once the winner's
    // atomic metadata write becomes visible (notably on Windows, where rename
    // cannot replace an existing target).
    let built = cachedRegistries(options, location);
    if (!built.complete && !result.ok) {
      for (const delayMs of [10, 20, 40, 80]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        built = cachedRegistries(options, location);
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

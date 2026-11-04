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
 * Returns `{ registry }` on a hit; on a miss `{ pending: { file, since } }`, `since`
 * being the metadata's mtime before the lookup (0 when absent); `{}` when no registry
 * can be had. settleRegistryBuilds, a stop signal or this process exiting ends it.
 */
export function startRegistryBuild(options, compiler = compileRegistryInChild) {
  try {
    if (process.env.VITEST_NATIVE_NO_REGISTRY === "1") return { registry: buildRegistry(options) };
    const location = registryLocation(options);
    const { registryFile, metaFile } = location;
    const joined = inFlight.get(registryFile);
    if (joined) return { pending: joined.pending };
    // Before the lookup, so a registry published in between still differs from `since`.
    const since = fs.statSync(metaFile, { throwIfNoEntry: false })?.mtimeMs ?? 0;
    const cached = buildRegistry({ ...options, location, cacheOnly: true, failOnError: true });
    if (cached) return { registry: cached };

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
        let file = validatedRegistry({ ...options, location });
        if (!file && !result.ok && !result.cancelled) {
          for (const delayMs of [10, 20, 40, 80]) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            file = validatedRegistry({ ...options, location });
            if (file) break;
          }
        }
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
    const location = registryLocation(options);
    const cached = buildRegistry({ ...options, location, cacheOnly: true, failOnError: true });
    if (cached) return cached;

    // A background build of the same entry is already running in this process (another
    // project in the run, or a config reload): wait for it instead of compiling twice.
    const joined = inFlight.get(location.registryFile);
    if (joined) {
      const file = await joined.done;
      if (file) return file;
    }

    const result = await compiler(COMPILER_FILE(), compilerInput(options));

    // Validate through the same cache contract every reader uses instead of
    // trusting a path returned over the child protocol. This also turns a losing
    // compiler in a concurrent cold-cache race into success once the winner's
    // atomic metadata write becomes visible (notably on Windows, where rename
    // cannot replace an existing target).
    let registryFile = buildRegistry({
      ...options,
      location,
      cacheOnly: true,
      failOnError: true,
      diagnostics: false,
    });
    if (!registryFile && !result.ok) {
      for (const delayMs of [10, 20, 40, 80]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        registryFile = buildRegistry({
          ...options,
          location,
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

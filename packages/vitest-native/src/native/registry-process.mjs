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
 * Resolve a warm registry, or start compiling a cache miss WITHOUT waiting for it.
 *
 * Why: a cold registry build takes seconds (about 2.5 s on an M-series Mac for React
 * Native 0.81), and waiting for it in config() put all of that ahead of the first test
 * file. Loading React Native file by file is the same React Native (the registry and the
 * per-file hooks run each module with Node's semantics and report the same frames, to
 * the column of the module as compiled), so a cold run can start at once and use the
 * registry as soon as it lands. The plugin still waits under the hot runtime, whose
 * worker keeps React Native resident from its first file, and on CI, where only total
 * time counts and per-file loading costs more than the build on a large suite.
 *
 * Rejected:
 *   - a detached child that outlives the run: it competes with the workers, and it
 *     breaks the rule that nothing vitest-native starts outlives Vitest;
 *   - building in teardown: the whole build lands at the end of the cold run, slower
 *     than building first;
 *   - building in parallel but only for the next run: a large cold suite would load
 *     React Native file by file for every file, which costs more than the build once a
 *     suite passes roughly thirty files per worker.
 * So workers pick the registry up mid-run (activeRegistry in context.mjs).
 *
 * A warm hit returns `{ registry }`, exactly as buildRegistryFor does. A miss returns
 * `{ pending }`: the registry file and the mtime its metadata had before the lookup (0
 * when absent), which is how a worker that starts later recognises a registry published
 * since (activeRegistry in context.mjs). The compiler is the same bounded child
 * buildRegistryFor uses, at the lowest CPU priority. settleRegistryBuilds ends it at
 * close; this process exiting, or a stop signal, ends it too. Returns `{}` when no
 * registry can be had at all.
 */
export function startRegistryBuild(options, compiler = compileRegistryInChild) {
  try {
    if (process.env.VITEST_NATIVE_NO_REGISTRY === "1") return { registry: buildRegistry(options) };
    const location = registryLocation(options);
    const { registryFile, metaFile } = location;
    const joined = inFlight.get(registryFile);
    if (joined) return { pending: joined.pending };
    // Read before the lookup: a registry published between the two then still
    // differs from `since`, so it is found rather than missed.
    let since = 0;
    try {
      since = fs.statSync(metaFile).mtimeMs;
    } catch {}
    const cached = buildRegistry({ ...options, location, cacheOnly: true, failOnError: true });
    if (cached) return { registry: cached };

    const controller = new AbortController();
    const started = performance.now();
    const done = (async () => {
      try {
        const result = await compiler(COMPILER_FILE(), options, {
          signal: controller.signal,
          priority: BACKGROUND_PRIORITY,
          // Never what keeps a finished run alive; settleRegistryBuilds waits for it
          // explicitly, and the exit hook stops it.
          unref: true,
        });
        // A concurrent run's compiler may have published it instead.
        const file = validatedRegistry({ ...options, location });
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
 * when the run closing was cancelled (`--bail`, Ctrl-C in a terminal): a cancel ends the
 * run early on purpose, and must not then wait. A cancel that does not close (a
 * watch-mode key such as `c` or a filter) leaves the build running for the reruns.
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
 * Whether this looks like a CI run, as std-env (Vitest's own detection) decides it: a
 * `CI` variable that is not "false", or one of the variables CI providers set.
 */
export const CI_VARIABLES = Object.freeze([
  "CI",
  "CONTINUOUS_INTEGRATION",
  "BUILD_ID",
  "BUILD_NUMBER",
  "RUN_ID",
  "CI_APP_ID",
  "CI_BUILD_ID",
  "CI_BUILD_NUMBER",
  "CI_NAME",
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

    const result = await compiler(COMPILER_FILE(), options);

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

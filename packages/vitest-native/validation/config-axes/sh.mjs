// Child processes for the config-axis harness (run.mjs): every one has a time budget, and
// a step that runs out of it says so, instead of surfacing as a killed job.
import { spawnSync } from "node:child_process";

export const RUN_TIMEOUT_MS = 240_000;
// A registry install of React Native, Vitest and RNTL: its own budget, well inside the
// job's 30 minutes, so a hung install is reported as one instead of as a killed job.
export const INSTALL_TIMEOUT_MS = 600_000;
// Exact, as every other tool the repository runs is pinned (syncpack); pnpm is fetched by
// npx, not added to any manifest.
export const PNPM = "pnpm@10.34.9";

export function sh(command, args, cwd, env = process.env, timeout = RUN_TIMEOUT_MS) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error && result.error.code !== "ETIMEDOUT") throw result.error;
  return {
    status: result.status,
    signal: result.signal,
    timedOut: result.error?.code === "ETIMEDOUT",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

export function must(result, what) {
  if (result.timedOut)
    throw new Error(`${what} timed out (no result in its time budget):\n${result.output}`);
  if (result.status !== 0)
    throw new Error(`${what} failed (exit ${result.status}):\n${result.output}`);
  return result;
}

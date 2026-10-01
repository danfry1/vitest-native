import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * One temporary root per test run, removed when the run ends.
 *
 * Tests create scratch projects with `fs.mkdtempSync(path.join(os.tmpdir(), …))`,
 * and many of them — and the CLIs and child processes they spawn — never removed
 * theirs: a single run of the unit suite left 64 entries in the system temp
 * directory, and a working machine had accumulated about 5,700. Rather than
 * chase every call site, the run gets its own root. `os.tmpdir()` reads TMPDIR
 * (POSIX) or TEMP/TMP (Windows) on every call, and Vitest runs global setup before
 * it starts any worker, so workers and the processes they spawn inherit the root.
 *
 * One directory per run still lands in the system temp directory: Vitest's own
 * module-fetcher root (`tmpdir()/<nanoid>/ssr`), created before global setup runs and
 * never removed by Vitest 5.0.0–5.0.2. Upstream fixed that in 5.0.3
 * (vitest-dev/vitest#11248).
 */
export default function setup(): () => void {
  const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-test-run-"));
  for (const name of Object.keys(saved)) process.env[name] = root;
  return () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  };
}

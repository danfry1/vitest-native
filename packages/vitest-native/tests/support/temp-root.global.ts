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
/**
 * The file in each run root that names the process owning it: `<hostname>\n<pid>`. A pid
 * means something only on the host that wrote it — a container sharing a bind-mounted
 * temp directory with its host has its own pid namespace — so roots are pruned only by
 * runs on the same host.
 */
const OWNER = ".vn-test-run-pid";

export function ownerRecord(pid = process.pid): string {
  return `${os.hostname()}\n${pid}`;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Remove the roots of earlier runs that were stopped before their teardown: Ctrl-C ends
 * Vitest without running global teardown, which leaves the whole root, scratch apps and
 * registry builds included. Only roots this setup made (the prefix and its owner file),
 * written on this host, whose owner process has ended are removed; anything else — another
 * host, an unreadable or older-format owner file — is kept.
 */
export function pruneAbandonedRoots(tmp: string): void {
  for (const name of fs.readdirSync(tmp)) {
    if (!name.startsWith("vn-test-run-")) continue;
    const dir = path.join(tmp, name);
    let owner: string;
    try {
      owner = fs.readFileSync(path.join(dir, OWNER), "utf8");
    } catch {
      continue; // not one of ours, or still being created
    }
    const [host, pidText, ...rest] = owner.split("\n");
    const pid = Number(pidText);
    if (host !== os.hostname() || rest.length > 0) continue;
    if (Number.isInteger(pid) && pid > 0 && !alive(pid)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

export default function setup(): () => void {
  const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
  const tmp = fs.realpathSync(os.tmpdir());
  pruneAbandonedRoots(tmp);
  const root = fs.mkdtempSync(path.join(tmp, "vn-test-run-"));
  fs.writeFileSync(path.join(root, OWNER), ownerRecord());
  for (const name of Object.keys(saved)) process.env[name] = root;
  return () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  };
}

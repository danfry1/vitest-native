import { spawnSync } from "node:child_process";
import fs from "node:fs";

/** Every live descendant of `pid` (children first found, deepest last). */
export function descendantsOf(pid) {
  const children = (parent) => {
    const out = spawnSync("pgrep", ["-P", String(parent)], { encoding: "utf8" });
    if (!out.error && (out.status === 0 || out.status === 1)) {
      return out.stdout.split("\n").filter(Boolean).map(Number);
    }
    // No pgrep: read parent ids from /proc (Linux).
    try {
      return fs
        .readdirSync("/proc")
        .filter((d) => /^\d+$/.test(d))
        .filter((d) => {
          try {
            const stat = fs.readFileSync(`/proc/${d}/stat`, "utf8");
            return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]) === parent;
          } catch {
            return false;
          }
        })
        .map(Number);
    } catch {
      return [];
    }
  };
  const found = [];
  const queue = [pid];
  while (queue.length > 0) {
    for (const child of children(queue.shift())) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

/**
 * Stop every process this one started, then exit with `code`. A forked test worker stuck
 * in a loop does not end with its parent: left alone it spins forever.
 */
export function exitKillingDescendants(code) {
  if (process.platform === "win32") {
    // Ends this process too, with its whole tree.
    process.exitCode = code;
    spawnSync("taskkill", ["/F", "/T", "/PID", String(process.pid)], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    for (const pid of descendantsOf(process.pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
  process.exit(code);
}

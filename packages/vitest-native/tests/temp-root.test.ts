/**
 * The run's temporary root (tests/support/temp-root.global.ts): a run stopped before its
 * teardown (Ctrl-C ends Vitest without running global teardown) leaves its root, and the
 * next run's setup removes it. Only roots that setup made on this host, whose owner has
 * ended: a container sharing the temp directory sees the host's pids as ended.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ownerRecord, pruneAbandonedRoots } from "./support/temp-root.global";

/** A process id that has ended: a child that has already exited. */
function endedPid(): number {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], {
    encoding: "utf8",
  });
  return Number(child.stdout);
}

describe("pruneAbandonedRoots", () => {
  it("removes an ended run's root, and leaves a live run's, another host's, a foreign one and other files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-prune-"));
    const root = (name: string, owner?: string) => {
      const dir = path.join(tmp, name);
      fs.mkdirSync(path.join(dir, "app", "node_modules"), { recursive: true });
      if (owner !== undefined) fs.writeFileSync(path.join(dir, ".vn-test-run-pid"), owner);
      return dir;
    };
    const ended = root("vn-test-run-ended", ownerRecord(endedPid()));
    const live = root("vn-test-run-live", ownerRecord());
    const foreign = root("vn-test-run-no-owner");
    const otherHost = root("vn-test-run-other-host", `not-${os.hostname()}\n${endedPid()}`);
    const barePid = root("vn-test-run-bare-pid", String(endedPid()));
    const other = root("someone-elses", ownerRecord(endedPid()));
    pruneAbandonedRoots(tmp);
    expect(fs.existsSync(ended)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
    expect(fs.existsSync(foreign)).toBe(true);
    expect(fs.existsSync(otherHost)).toBe(true);
    expect(fs.existsSync(barePid)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

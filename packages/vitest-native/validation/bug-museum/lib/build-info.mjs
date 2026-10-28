// Which commit a build under test is. build-ref.mjs writes `.museum-build.json` ({ sha,
// ref }) into every package it builds from a git ref; only those builds have a provable
// SHA, and status.mjs accepts only verdicts that carry one. Any other directory (a working
// tree's own dist/) is reported by its checkout's HEAD, marked `unverified`: its dist may
// not be what HEAD would build.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const BUILD_INFO = ".museum-build.json";

export function buildInfo(dir) {
  const file = path.join(dir, BUILD_INFO);
  if (fs.existsSync(file)) {
    const { sha, ref } = JSON.parse(fs.readFileSync(file, "utf8"));
    return { sha, ref, verified: true };
  }
  const git = (...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const head = git("rev-parse", "HEAD");
  if (head.status !== 0) return { sha: "unknown", verified: false };
  const dirty = git("status", "--porcelain", "--", ".").stdout.trim() !== "";
  return { sha: `${head.stdout.trim()}${dirty ? "+dirty" : ""}`, verified: false };
}

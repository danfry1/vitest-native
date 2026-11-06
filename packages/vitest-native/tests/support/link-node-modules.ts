import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A temp directory under the long spelling of the temp root: Windows runners report an
 * 8.3 short name (RUNNER~1), and two spellings of one file are two instances to Vite.
 */
export function longTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), prefix));
}

/** A directory link: a junction on Windows, which needs no symlink privilege. */
export function linkDir(target: string, dest: string): void {
  fs.symlinkSync(
    fs.realpathSync.native(target),
    dest,
    process.platform === "win32" ? "junction" : "dir",
  );
}

/**
 * Links every package of `from` (a node_modules directory) into `to`, a scope's packages
 * one by one, each to its real directory: a junction to a store link is not followed the
 * way Node follows a symlink.
 */
export function linkNodeModules(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from)) {
    if (entry.startsWith(".")) continue;
    const source = path.join(from, entry);
    if (entry.startsWith("@")) {
      fs.mkdirSync(path.join(to, entry), { recursive: true });
      for (const scoped of fs.readdirSync(source)) {
        linkDir(path.join(source, scoped), path.join(to, entry, scoped));
      }
    } else {
      linkDir(source, path.join(to, entry));
    }
  }
}

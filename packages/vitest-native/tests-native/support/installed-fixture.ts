// An installed package built from fixture directories into this package's node_modules,
// safe under concurrent runs (scripts/run-scripts.mjs runs several configs at once, each
// with its own global setup). A package already built from the current fixtures (its
// stamp matches) is left alone. Only a missing or outdated one is rebuilt, in a temporary
// directory renamed into place. Nothing removes it afterwards: removing and renaming
// directories in the shared node_modules on every run made other runs starting at the same
// moment find no test files at all, or not find the package. node_modules is not
// committed, and the next change to the fixtures replaces it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modules = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..", "node_modules");
const STAMP = ".vn-fixture-stamp";

/** A hash of every file under the given directories (absolute): the package's version. */
function stampOf(sources: string[]): string {
  const hash = crypto.createHash("sha256");
  const walk = (dir: string, rel: string) => {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const name = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(abs, name);
      else hash.update(name).update("\0").update(fs.readFileSync(abs)).update("\0");
    }
  };
  for (const source of sources) walk(source, path.basename(source));
  return hash.digest("hex");
}

/** Whether `dir` holds a build stamped `stamp` (none yet, or an older one: no). */
function current(dir: string, stamp: string): boolean {
  const file = path.join(dir, STAMP);
  return fs.existsSync(file) && fs.readFileSync(file, "utf8") === stamp;
}

/**
 * Builds node_modules/<name> with `build` from the fixture directories `sources`
 * (absolute), unless it is already built from them.
 */
export function place(name: string, sources: string[], build: (dir: string) => void) {
  const target = path.join(modules, name);
  const stamp = stampOf(sources);
  if (current(target, stamp)) return;
  const staging = `${target}.${process.pid}.${Date.now()}.tmp`;
  build(staging);
  fs.writeFileSync(path.join(staging, STAMP), stamp);
  // Rename first, without removing anything: if the target exists, another run may have
  // built the same thing a moment ago.
  if (!fs.existsSync(target)) {
    try {
      fs.renameSync(staging, target);
      return;
    } catch (error) {
      if (!fs.existsSync(target)) throw error;
    }
  }
  if (current(target, stamp)) {
    fs.rmSync(staging, { recursive: true, force: true });
    return;
  }
  // Outdated (the fixtures changed): replace it. Rare, so the brief gap is acceptable.
  fs.rmSync(target, { recursive: true, force: true });
  try {
    fs.renameSync(staging, target);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (!current(target, stamp)) throw error;
  }
}

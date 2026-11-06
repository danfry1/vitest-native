// Installed packages the dispatch and nodeMocks tests need, built in node_modules for the
// run rather than declared as nested `file:` dependencies, which bun records differently
// on Windows (a frozen install failed there):
// - `dispatch-consumer-lib`, an installed package whose require reaches the top-level
//   fixtures (dispatch-target-lib and its siblings) from node_modules, as Node walks up;
// - `dispatch-nested-lib`, with its own nested copy of dispatch-target-lib
//   (fixtures/dispatch-target-lib-v2);
// - `vn-installed-ts-lib`, an installed package that ships TypeScript source (#544).
//
// Several configs run at once (scripts/run-scripts.mjs), and each runs this setup. A
// package already built from the current fixtures (its stamp matches) is left alone:
// replacing it on every run, by removing and renaming directories in the shared
// node_modules, made other runs starting at the same moment find no test files at all
// (about one run in five under three concurrent runs). Only a missing or outdated package
// is rebuilt, in a temporary directory renamed into place; nothing removes it afterwards,
// since node_modules is not committed and the next change replaces it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "..", "fixtures");
const modules = path.resolve(here, "../..", "node_modules");
const STAMP = ".vn-fixture-stamp";

/** A hash of every file under the given fixture directories: the package's version. */
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
  for (const source of sources) walk(path.join(fixtures, source), source);
  return hash.digest("hex");
}

/** Whether `dir` holds a build stamped `stamp` (none yet, or an older one: no). */
function current(dir: string, stamp: string): boolean {
  const file = path.join(dir, STAMP);
  return fs.existsSync(file) && fs.readFileSync(file, "utf8") === stamp;
}

function place(name: string, sources: string[], build: (dir: string) => void) {
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

export function setup() {
  place("vn-installed-ts-consumer", ["vn-installed-ts-consumer"], (dir) =>
    fs.cpSync(path.join(fixtures, "vn-installed-ts-consumer"), dir, { recursive: true }),
  );
  place("vn-installed-ts-lib", ["vn-installed-ts-lib"], (dir) =>
    fs.cpSync(path.join(fixtures, "vn-installed-ts-lib"), dir, { recursive: true }),
  );
  place("dispatch-consumer-lib", ["dispatch-consumer-lib"], (dir) =>
    fs.cpSync(path.join(fixtures, "dispatch-consumer-lib"), dir, { recursive: true }),
  );
  place("dispatch-nested-lib", ["dispatch-nested-lib", "dispatch-target-lib-v2"], (dir) => {
    fs.cpSync(path.join(fixtures, "dispatch-nested-lib"), dir, { recursive: true });
    fs.cpSync(
      path.join(fixtures, "dispatch-target-lib-v2"),
      path.join(dir, "node_modules", "dispatch-target-lib"),
      { recursive: true },
    );
  });
}

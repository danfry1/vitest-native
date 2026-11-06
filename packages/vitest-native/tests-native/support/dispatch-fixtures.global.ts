// Installed packages the dispatch and nodeMocks tests need, built in node_modules for the
// run rather than declared as nested `file:` dependencies, which bun records differently
// on Windows (a frozen install failed there):
// - `dispatch-consumer-lib`, an installed package whose require reaches the top-level
//   fixtures (dispatch-target-lib and its siblings) from node_modules, as Node walks up;
// - `dispatch-nested-lib`, with its own nested copy of dispatch-target-lib
//   (fixtures/dispatch-target-lib-v2);
// - `vn-installed-ts-lib`, an installed package that ships TypeScript source (#544).
// Several configs run at once (scripts/run-scripts.mjs), so each package is built in a
// temporary directory and renamed into place, and nothing removes it afterwards:
// node_modules is not committed, and the next build replaces it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "..", "fixtures");
const modules = path.resolve(here, "../..", "node_modules");

function place(name: string, build: (dir: string) => void) {
  const target = path.join(modules, name);
  const staging = `${target}.${process.pid}.${Date.now()}.tmp`;
  build(staging);
  fs.rmSync(target, { recursive: true, force: true });
  try {
    fs.renameSync(staging, target);
  } catch (error) {
    // Another config placed it first: theirs is the same build.
    fs.rmSync(staging, { recursive: true, force: true });
    if (!fs.existsSync(path.join(target, "package.json"))) throw error;
  }
}

export function setup() {
  place("vn-installed-ts-lib", (dir) =>
    fs.cpSync(path.join(fixtures, "vn-installed-ts-lib"), dir, { recursive: true }),
  );
  place("dispatch-consumer-lib", (dir) =>
    fs.cpSync(path.join(fixtures, "dispatch-consumer-lib"), dir, { recursive: true }),
  );
  place("dispatch-nested-lib", (dir) => {
    fs.cpSync(path.join(fixtures, "dispatch-nested-lib"), dir, { recursive: true });
    fs.cpSync(
      path.join(fixtures, "dispatch-target-lib-v2"),
      path.join(dir, "node_modules", "dispatch-target-lib"),
      { recursive: true },
    );
  });
}

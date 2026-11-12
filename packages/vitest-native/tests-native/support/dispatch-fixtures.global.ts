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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { place as placeFrom } from "./installed-fixture";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "..", "fixtures");

/** `place` with sources named relative to tests-native/fixtures. */
const place = (name: string, sources: string[], build: (dir: string) => void) =>
  placeFrom(
    name,
    sources.map((source) => path.join(fixtures, source)),
    build,
  );

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

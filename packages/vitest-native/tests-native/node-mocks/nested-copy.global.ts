// An installed package with its own nested copy of another one, built for the run and
// removed after it (node_modules is not committed): `dispatch-nested-lib`, whose
// node_modules holds a second `dispatch-target-lib` (fixtures/dispatch-target-lib-v2).
// Built here rather than declared as nested `file:` dependencies, which bun records
// differently on Windows, so a frozen install failed there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "..", "fixtures");
const installed = path.resolve(here, "../..", "node_modules", "dispatch-nested-lib");

export function setup() {
  teardown();
  fs.cpSync(path.join(fixtures, "dispatch-nested-lib"), installed, { recursive: true });
  fs.cpSync(
    path.join(fixtures, "dispatch-target-lib-v2"),
    path.join(installed, "node_modules", "dispatch-target-lib"),
    { recursive: true },
  );
}

export function teardown() {
  fs.rmSync(installed, { recursive: true, force: true });
}

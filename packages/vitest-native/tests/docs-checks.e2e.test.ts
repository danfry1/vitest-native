import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `test:docs` (scripts/docs-checks.mjs) once listed a file that its run skipped in silence
// (#890). This runs the script itself on a fixture list: an end-to-end test that must run
// under the e2e config, and a file whose only test is skipped. The script is started
// through a symlinked directory, as macOS's /tmp is, so a run-as-script check that misses
// the link (and exits 0 without running anything) fails here too.
const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("test:docs", () => {
  it("fails, naming a listed file that did not run", () => {
    const name = `tmp-docs-checks-${process.pid}`;
    const fixtures = path.join(PACKAGE, "tests", name);
    // The fixtures sit under tests/, where both configs look, so this test removes them;
    // the symlink is left to the run's temporary root.
    fs.mkdirSync(fixtures);
    try {
      fs.writeFileSync(
        path.join(fixtures, "runs.e2e.test.ts"),
        'import { expect, it } from "vitest";\nit("runs", () => expect(1).toBe(1));\n',
      );
      fs.writeFileSync(
        path.join(fixtures, "skipped.test.ts"),
        'import { it } from "vitest";\nit.skip("never runs", () => {});\n',
      );

      const link = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "docs-checks-link-")),
        "scripts",
      );
      fs.symlinkSync(path.join(PACKAGE, "scripts"), link, "junction");

      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")),
      );
      const run = spawnSync(
        process.execPath,
        [path.join(link, "docs-checks.mjs"), `${name}/runs.e2e.test.ts`, `${name}/skipped.test.ts`],
        { cwd: PACKAGE, env, encoding: "utf8" },
      );
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain(
        `listed but did not run: tmp-docs-checks-${process.pid}/skipped.test.ts\n`,
      );
    } finally {
      fs.rmSync(fixtures, { recursive: true, force: true });
    }
  }, 120_000);
});

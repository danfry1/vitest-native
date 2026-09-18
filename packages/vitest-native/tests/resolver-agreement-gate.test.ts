/**
 * The resolver-agreement warning is a diagnostic, not a default.
 *
 * It compares Node's resolution against the package manifest, and never sees Vite's
 * module graph — so a package only Node ever requires looks exactly like one both
 * graphs load. Reported as noise on every test file of a real project (#201), for
 * `test-renderer` (required by RNTL), `nanoid` (required by postcss) and Babel's
 * source-map packages, none of which Vite loads.
 *
 * Driven through the installed require hook rather than by calling the checker: the
 * gate lives at the call site, so calling the checker directly would not see it. The
 * hooks patch `Module` process-wide, hence the subprocess.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOKS = path.join(HERE, "..", "src", "native", "hooks.mjs");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/** A project with one installed dual-format package, resolved through the hook. */
function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-agreement-gate-"));
  roots.push(root);
  const dir = path.join(root, "node_modules", "split-lib");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "split-lib", main: "./index.cjs", module: "./index.mjs" }),
  );
  fs.writeFileSync(path.join(dir, "index.cjs"), "module.exports = {};");
  fs.writeFileSync(path.join(dir, "index.mjs"), "export default {};");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "host" }));
  fs.writeFileSync(path.join(root, "test.cjs"), "require('split-lib');");
  return root;
}

function warningsWhenResolving(diagnostics: boolean): string {
  const root = project();
  const script = [
    `const { installRequireHooks } = await import(${JSON.stringify(HOOKS)});`,
    `installRequireHooks(${JSON.stringify(root)});`,
    `const { createRequire } = await import("node:module");`,
    `createRequire(${JSON.stringify(path.join(root, "test.cjs"))})("split-lib");`,
  ].join("\n");
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      VITEST_NATIVE_DIAGNOSTICS: diagnostics ? "true" : "false",
    },
  });
  if (run.status !== 0) throw new Error(`resolving through the hook failed:\n${run.stderr}`);
  // The warning is a console.warn, so it lands on stderr.
  return `${run.stdout}${run.stderr}`;
}

describe("resolver-agreement warning", () => {
  it("stays quiet by default, for a package Vite may never load", () => {
    expect(warningsWhenResolving(false)).not.toContain("resolves to two different files");
  });

  it("reports under diagnostics, naming both files", () => {
    const output = warningsWhenResolving(true);
    expect(output).toContain("'split-lib' resolves to two different files");
    expect(output).toContain("index.cjs");
    expect(output).toContain("index.mjs");
  });

  it("says the comparison cannot see Vite's graph", () => {
    expect(warningsWhenResolving(true)).toMatch(/cannot see whether Vite loaded/);
  });
});

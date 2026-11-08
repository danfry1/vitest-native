/**
 * Runs an app laid out as a bug-museum exhibit (a vitest config, its tests, `vendor/*`
 * packages) as its own Vitest run against this build, with node_modules assembled from
 * this repository's install (materialise). `from` is the app directory, for a fixture
 * kept beside its test; by default, the exhibit named `id`, whose exhibits.json entry
 * (its workspace `links`, installed copies) shapes the install either way. `cwd` maps the
 * app root to the directory the run starts in (another spelling of it).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterAll } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import {
  materialise,
  museumRoot,
  packageRoot,
} from "../../validation/bug-museum/lib/materialise.mjs";

export interface Edit {
  file: string;
  find: string;
  replace: string;
}

const works: string[] = [];
afterAll(() => {
  for (const work of works) fs.rmSync(work, { recursive: true, force: true });
});

export function runApp(
  id: string,
  {
    from,
    edits = [],
    cwd = (root) => root,
  }: { from?: string; edits?: Edit[]; cwd?: (root: string) => string } = {},
): { status: number | null; output: string } {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `vn-${id}-`));
  works.push(work);
  const exhibit = JSON.parse(
    fs.readFileSync(path.join(museumRoot, "exhibits.json"), "utf8"),
  ).exhibits.find((e: { id: string }) => e.id === id) ?? { id };
  const root = materialise(exhibit, { work, build: packageRoot, edits, from });
  const vitest = path.join(fs.realpathSync(path.join(root, "node_modules/vitest")), "vitest.mjs");
  // The child is its own Vitest run, not a worker of this one. Its output is matched as
  // text, so it prints without colour (CI sets FORCE_COLOR).
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("VITEST") && key !== "FORCE_COLOR",
    ),
  );
  const proc = spawnSync(process.execPath, [vitest, "run"], {
    // The run's working directory, which is its root: another spelling of it, if asked.
    cwd: cwd(root),
    env: { ...env, NODE_ENV: "test", NO_COLOR: "1" },
    encoding: "utf8",
    timeout: 120_000,
  });
  // Stripped as well, for any colour a tool prints regardless.
  return {
    status: proc.status,
    output: stripVTControlCharacters(`${proc.stdout}\n${proc.stderr}`),
  };
}

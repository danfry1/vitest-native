/**
 * Runs an app laid out as a bug-museum exhibit (a vitest config, its tests, `vendor/*`
 * packages) as its own Vitest run against this build, with node_modules assembled from
 * this repository's install (materialise). `from` is the app directory, for a fixture
 * kept beside its test; by default, the exhibit named `id`, whose exhibits.json entry
 * (its workspace `links`, installed copies) shapes the install either way.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { materialise, museumRoot, packageRoot } from "../../validation/bug-museum/lib/materialise.mjs";

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
  { from, edits = [] }: { from?: string; edits?: Edit[] } = {},
): { status: number | null; output: string } {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `vn-${id}-`));
  works.push(work);
  const exhibit = JSON.parse(
    fs.readFileSync(path.join(museumRoot, "exhibits.json"), "utf8"),
  ).exhibits.find((e: { id: string }) => e.id === id) ?? { id };
  const root = materialise(exhibit, { work, build: packageRoot, edits, from });
  const vitest = path.join(fs.realpathSync(path.join(root, "node_modules/vitest")), "vitest.mjs");
  // The child is its own Vitest run, not a worker of this one.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")),
  );
  const proc = spawnSync(process.execPath, [vitest, "run"], {
    cwd: root,
    env: { ...env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: proc.status, output: `${proc.stdout}\n${proc.stderr}` };
}

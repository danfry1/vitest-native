import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { main } from "../src/cli/index.ts";

// The landing page's "See it work" replay (website/.vitepress/replay/) is what the CLI
// prints for a sample app: this runs `vitest-native migrate`, then `migrate --write`, on
// tests/fixtures/sample-app and keeps the output, and the config it writes, with
// toMatchFileSnapshot. A change to the CLI's output fails here until the replay is
// regenerated (`test:e2e -u`), so the site never shows output the CLI no longer prints.
// It runs under the e2e config, which loads no plugin: under the unit config the
// package's own Node hooks answer for react-native and the report would describe them.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(packageRoot, "tests/fixtures/sample-app");
const REPLAY = path.join(packageRoot, "../../website/.vitepress/replay");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vn-replay-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

/** The sample app in a scratch directory, resolving packages as an app would. */
function sampleApp(): string {
  const root = path.join(scratch, "sample-app");
  fs.cpSync(FIXTURE, root, { recursive: true });
  // The package's own installed React Native and libraries, in place of an app's install.
  fs.symlinkSync(path.join(packageRoot, "node_modules"), path.join(root, "node_modules"), "dir");
  return root;
}

async function run(root: string, argv: string[]): Promise<string[]> {
  const lines: string[] = [];
  const code = await main([...argv, "--root", root], (line) => lines.push(line));
  expect(code, lines.join("\n")).toBe(0);
  // The scratch directory stands for the reader's project root.
  return lines
    .flatMap((line) => line.split("\n"))
    .map((line) => line.replaceAll(fs.realpathSync(root), ".").replaceAll(root, "."));
}

it("replays what migrate prints for the sample app", async () => {
  const root = sampleApp();
  const report = await run(root, ["migrate"]);
  const written = await run(root, ["migrate", "--write"]);
  const wrote = written.findIndex((line) => line.startsWith("✓ wrote "));
  expect(wrote).toBeGreaterThan(0);
  // `--write` prints the same report, without its "Re-run with --write" line, before
  // writing: the replay shows it once.
  const rerun = report.findIndex((line) => line.startsWith("Re-run with --write"));
  expect(rerun).toBeGreaterThan(0);
  expect(written.slice(0, wrote)).toEqual([...report.slice(0, rerun), ...report.slice(rerun + 2)]);
  const configFile = /^✓ wrote (\S+)/.exec(written[wrote])![1];

  // The written config's name is part of the "after" panel's title on the site.
  expect(configFile).toBe("vitest.config.mjs");
  const text = (lines: string[]) => `${lines.join("\n").trimEnd()}\n`;
  await expect(text(report)).toMatchFileSnapshot(path.join(REPLAY, "migrate.txt"));
  await expect(text(written.slice(wrote))).toMatchFileSnapshot(path.join(REPLAY, "write.txt"));
  // `.txt`, so no tool takes it for this repository's own Vitest config.
  await expect(fs.readFileSync(path.join(root, configFile), "utf8")).toMatchFileSnapshot(
    path.join(REPLAY, "vitest.config.mjs.txt"),
  );
});

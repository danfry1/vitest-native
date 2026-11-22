/**
 * The ownership guard sees one file's two copies whichever spelling of the project root
 * the run started from (#592). The fixture's setup file requires its store through Node,
 * from a path built on the working directory, before the test imports it through Vite.
 * Started from the root's Windows 8.3 short spelling (RUNNER~1), Node's file name keeps
 * it while Vite's id is long; the ledger keys both sides alike (fileKey), so the guard
 * still reports the file. Windows only: other platforms have no short names, and a
 * different letter case is already folded there.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

/** `dir`'s 8.3 short spelling, through cmd's own expansion. */
const shortSpelling = (dir: string) =>
  execSync(`for %I in ("${fs.realpathSync.native(dir)}") do @echo %~sI`, {
    shell: "cmd.exe",
    encoding: "utf8",
  }).trim();

it.runIf(process.platform === "win32")(
  "reports a file evaluated twice when the run starts from the root's short spelling",
  () => {
    const { status, output } = runApp("ledger-short-root", {
      from: path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/ledger-short-root"),
      cwd: (root) => {
        const short = shortSpelling(root);
        // Without a short name (8.3 names disabled on the volume) there is nothing to test.
        expect(short.toLowerCase()).not.toBe(fs.realpathSync.native(root).toLowerCase());
        return short;
      },
    });
    expect(status, output).toBe(0);
    expect(output).toMatch(/ownership: 1 file\(s\) were evaluated by both Node and Vite/);
    expect(output).toMatch(/src[\\/]store\.ts/);
  },
  150_000,
);

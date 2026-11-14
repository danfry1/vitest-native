/**
 * scripts/support/arguments.mjs: the repository's scripts read their arguments strictly,
 * so an argument a script does not read stops it before it does anything.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { parseArguments } from "../scripts/support/arguments.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = { script: "s.mjs", valued: ["build", "only"], flags: ["keep"], positionals: 1 };

describe("parseArguments", () => {
  it("reads valued flags, flags and positionals", () => {
    expect(parseArguments(["ref", "--build", "/x", "--keep"], SPEC)).toEqual({
      values: { build: "/x", keep: true },
      positionals: ["ref"],
    });
  });

  it("refuses a flag and its value given as one word", () => {
    // What `args="--build $dir"; s.mjs $args` passes under zsh, which does not split it.
    expect(() => parseArguments(["--build /x"], SPEC)).toThrow(
      's.mjs: unknown argument "--build /x"',
    );
  });

  it("refuses an unknown flag, a single-dash flag and a word past the positionals", () => {
    expect(() => parseArguments(["--bulid", "/x"], SPEC)).toThrow('unknown argument "--bulid"');
    expect(() => parseArguments(["-k"], SPEC)).toThrow('unknown argument "-k"');
    expect(() => parseArguments(["ref", "extra"], SPEC)).toThrow('unknown argument "extra"');
  });

  it("refuses a valued flag without a value, and a flag given twice", () => {
    expect(() => parseArguments(["--build"], SPEC)).toThrow("--build needs a value");
    expect(() => parseArguments(["--build", "--keep"], SPEC)).toThrow("--build needs a value");
    expect(() => parseArguments(["--keep", "--keep"], SPEC)).toThrow("--keep is given twice");
  });
});

/** Every file under scripts/ and validation/ (not node_modules) with one of `extensions`. */
function sources(extensions: RegExp): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extensions.test(entry.name)) found.push(full);
    }
  };
  walk(path.join(packageRoot, "scripts"));
  walk(path.join(packageRoot, "validation"));
  return found;
}

const NO_WORK = pathToFileURL(path.join(packageRoot, "tests/support/no-work.mjs")).href;
const rel = (file: string) => path.relative(packageRoot, file).split(path.sep).join("/");

it("no script looks for its flags in process.argv itself, which ignores the ones it does not read", () => {
  const offenders = sources(/\.(m?js|ts)$/)
    .filter((file) => /process\.argv\.(indexOf|includes)\(/.test(fs.readFileSync(file, "utf8")))
    .map(rel);
  expect(offenders, "read arguments with scripts/support/arguments.mjs").toEqual([]);
});

const parsed = sources(/\.mjs$/)
  .filter((file) => !file.endsWith(path.join("support", "arguments.mjs")))
  .filter((file) => /support\/arguments\.mjs"/.test(fs.readFileSync(file, "utf8")))
  .map(rel)
  .sort();

it("finds the scripts that read their arguments this way", () => {
  expect(parsed.length).toBeGreaterThanOrEqual(13);
});

describe.each(parsed)("%s", (script) => {
  it("stops on an argument it does not read, before any work", () => {
    // no-work.mjs makes any process or file the script starts throw, so a script that no
    // longer stops here fails without running its work.
    const run = spawnSync(process.execPath, ["--import", NO_WORK, script, "--build /some/dir"], {
      cwd: packageRoot,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    expect(run.stderr).toContain('unknown argument "--build /some/dir"');
    expect(run.status).toBe(2);
    // Each prints progress or results as it works: nothing on stdout means it did none.
    expect(run.stdout).toBe("");
  });
});

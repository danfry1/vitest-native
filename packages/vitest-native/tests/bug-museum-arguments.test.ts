import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs
import { checkArguments } from "../validation/bug-museum/run.mjs";

describe("the museum runner's arguments", () => {
  it("takes its flags, and its valued flags with their values", () => {
    expect(() =>
      checkArguments(["--only", "a,b", "--build", "/x", "--keep", "--hot", "auto", "--allow-na"]),
    ).not.toThrow();
  });

  it("refuses a flag and its value given as one word", () => {
    // What `args="--build $dir"; run.mjs $args` passes under zsh, which does not split it.
    expect(() => checkArguments(["--only", "x", "--build /some/dir"])).toThrow(
      /unknown argument "--build \/some\/dir"/,
    );
  });

  it("refuses an unknown flag and a stray word", () => {
    expect(() => checkArguments(["--bulid", "/x"])).toThrow(/unknown argument "--bulid"/);
    expect(() => checkArguments(["/x"])).toThrow(/unknown argument "\/x"/);
  });

  it("refuses a valued flag with no value", () => {
    expect(() => checkArguments(["--build"])).toThrow(/--build needs a value/);
    expect(() => checkArguments(["--build", "--keep"])).toThrow(/--build needs a value/);
  });

  it("is what the runner checks before it runs anything", () => {
    const run = spawnSync(
      process.execPath,
      // --only an exhibit that does not exist: a runner that skips the check stops at
      // "no exhibit" instead of running the whole museum.
      [
        path.join(import.meta.dirname, "../validation/bug-museum/run.mjs"),
        "--only",
        "no-such-exhibit",
        "--build /some/dir",
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/unknown argument "--build \/some\/dir"/);
  });
});

/**
 * The bug museum's --node-mocks axis (validation/config-axes/node-mocks.mjs, with
 * validation/bug-museum/lib/materialise.mjs wrapForExperimental): every exhibit runs with
 * experimental.nodeMocks on or off, in one experimental object with --ownership, and only
 * on a build that reads the flag.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  experimentalEntries,
  judgeNodeMocksSupport,
  nodeMocksArgument,
  nodeMocksSupport,
  NOT_RUNNABLE,
  // @ts-expect-error — runtime .mjs, no types
} from "../validation/config-axes/node-mocks.mjs";
// @ts-expect-error — runtime .mjs, no types
import { UNSUPPORTED } from "../validation/config-axes/ownership.mjs";
import {
  EXPERIMENTAL_MARKER,
  wrapForExperimental,
  // @ts-expect-error — runtime .mjs, no types
} from "../validation/bug-museum/lib/materialise.mjs";
// @ts-expect-error — runtime .mjs, no types
import { checkArguments, experimentalLabel } from "../validation/bug-museum/run.mjs";
// @ts-expect-error — runtime .mjs, no types
import { axisProblem } from "../validation/bug-museum/lib/axes.mjs";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** An installed vitest-native whose reactNative() runs `body` with `options` in scope. */
function fakeBuild(body: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-node-mocks-axis-"));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, "dist"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "vitest-native",
      type: "module",
      exports: { ".": { default: "./dist/index.mjs" } },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "dist/index.mjs"),
    `export const other = "kept";\nexport function reactNative(options) {\n${body}\n}\n`,
  );
  return dir;
}

// What a build that reads both flags does (src/validate.ts, in short).
const READS_BOTH = `
  const e = options?.experimental ?? {};
  for (const key of Object.keys(e))
    if (key !== "ownershipModel" && key !== "nodeMocks")
      throw new Error('Unknown experimental option "' + key + '".');
  if (e.nodeMocks !== undefined && typeof e.nodeMocks !== "boolean")
    throw new Error('"experimental.nodeMocks" must be a boolean.');
  if (e.ownershipModel === "resolution" && e.nodeMocks === false)
    throw new Error('"experimental.ownershipModel": "resolution" turns "experimental.nodeMocks" on, and cannot run with it set to false.');
  return options;`;

describe("--node-mocks arguments", () => {
  it("is a valued flag of the runner", () => {
    expect(() => checkArguments(["--node-mocks", "on", "--ownership", "resolver"])).not.toThrow();
    expect(() => checkArguments(["--node-mocks"])).toThrow(/--node-mocks needs a value/);
  });

  it("takes on or off, and leaves the option unset without it", () => {
    expect(nodeMocksArgument(undefined)).toBeNull();
    expect(nodeMocksArgument("on")).toBe("on");
    expect(nodeMocksArgument("off")).toBe("off");
    expect(() => nodeMocksArgument("true")).toThrow(/on, off/);
  });
});

describe("one experimental object for both axes", () => {
  it("merges --ownership and --node-mocks", () => {
    expect(experimentalEntries({ ownershipModel: "resolver", nodeMocks: "on" })).toEqual({
      ownershipModel: "resolver",
      nodeMocks: true,
    });
    expect(experimentalEntries({ ownershipModel: "off", nodeMocks: "off" })).toEqual({
      nodeMocks: false,
    });
    expect(experimentalEntries({ ownershipModel: "resolution", nodeMocks: null })).toEqual({
      ownershipModel: "resolution",
    });
    expect(experimentalEntries({ ownershipModel: "off", nodeMocks: null })).toEqual({});
  });

  it("the wrapper gives every reactNative() call both entries, keeps the exhibit's own, and records the call", async () => {
    const installed = fakeBuild("return options;");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-node-mocks-root-"));
    dirs.push(root);
    wrapForExperimental(installed, root, { ownershipModel: "resolver", nodeMocks: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8"));
    const wrapped = await import(
      pathToFileURL(path.join(installed, manifest.exports["."].default)).href
    );
    expect(wrapped.reactNative({ hotRuntime: false, experimental: { other: 1 } })).toEqual({
      hotRuntime: false,
      experimental: { other: 1, ownershipModel: "resolver", nodeMocks: true },
    });
    // an exhibit that sets nodeMocks itself is overridden: the axis decides
    expect(wrapped.reactNative({ experimental: { nodeMocks: false } })).toEqual({
      experimental: { ownershipModel: "resolver", nodeMocks: true },
    });
    expect(wrapped.other).toBe("kept");
    expect(fs.readFileSync(path.join(root, EXPERIMENTAL_MARKER), "utf8").split("\n")).toEqual([
      '{"ownershipModel":"resolver","nodeMocks":true}',
      '{"ownershipModel":"resolver","nodeMocks":true}',
      "",
    ]);
  });

  it("names both flags in the runner's messages", () => {
    expect(experimentalLabel({ ownershipModel: "resolver", nodeMocks: true })).toBe(
      "experimental.ownershipModel: resolver, experimental.nodeMocks: true",
    );
  });
});

describe("whether a build reads experimental.nodeMocks", () => {
  it("judges the probe's observations", () => {
    const reads = { accepted: null, rejected: '"experimental.nodeMocks" must be a boolean.' };
    expect(judgeNodeMocksSupport({ ...reads, warnings: [] })).toEqual({ supported: true });
    // a build from before `experimental`: warned about and ignored
    expect(
      judgeNodeMocksSupport({
        accepted: null,
        rejected: null,
        warnings: ["[vitest-native] Unknown option 'experimental'."],
      }),
    ).toMatchObject({ supported: false, reason: expect.stringContaining(UNSUPPORTED) });
    // a build with `experimental` but not this entry
    expect(
      judgeNodeMocksSupport({
        accepted: 'Unknown experimental option "nodeMocks".',
        rejected: 'Unknown experimental option "nodeMocks".',
        warnings: [],
      }),
    ).toMatchObject({ supported: false, reason: expect.stringContaining(UNSUPPORTED) });
    // a build that accepts any value does not read it
    expect(judgeNodeMocksSupport({ accepted: null, rejected: null, warnings: [] })).toMatchObject({
      supported: false,
      reason: expect.stringContaining("does not read it"),
    });
    // both flags read, the combination rejected by name: not runnable, not broken
    expect(
      judgeNodeMocksSupport({
        ...reads,
        combined: '"experimental.ownershipModel": "resolution" turns "experimental.nodeMocks" on',
        warnings: [],
      }),
    ).toMatchObject({ supported: false, reason: expect.stringContaining(NOT_RUNNABLE) });
    // anything else that throws is a broken build: the run fails
    expect(() =>
      judgeNodeMocksSupport({ accepted: "boom", rejected: "boom", warnings: [] }),
    ).toThrow(/throws for the requested value: boom/);
    expect(() => judgeNodeMocksSupport({ ...reads, combined: "boom", warnings: [] })).toThrow(
      /throws for the requested combination: boom/,
    );
  });

  it("asks the build itself", () => {
    const reads = fakeBuild(READS_BOTH);
    const unknown = fakeBuild(
      `if (options?.experimental?.nodeMocks !== undefined) throw new Error('Unknown experimental option "nodeMocks".');`,
    );
    const warns = fakeBuild(
      `if (options?.experimental) console.warn("[vitest-native] Unknown option 'experimental'.");`,
    );
    const ignores = fakeBuild("return {};");
    const broken = fakeBuild(`throw new Error("broken build");`);
    const unloadable = fakeBuild("");
    fs.writeFileSync(path.join(unloadable, "dist/index.mjs"), 'throw new Error("cannot load");\n');

    expect(nodeMocksSupport(reads, "on")).toEqual({ supported: true });
    expect(nodeMocksSupport(reads, "off", "resolver")).toEqual({ supported: true });
    expect(nodeMocksSupport(reads, "on", "resolution")).toEqual({ supported: true });
    expect(nodeMocksSupport(reads, "off", "resolution")).toMatchObject({
      supported: false,
      reason: expect.stringMatching(/combination not runnable.*"resolution" turns/),
    });
    expect(nodeMocksSupport(unknown, "on").reason).toContain(UNSUPPORTED);
    expect(nodeMocksSupport(warns, "on").reason).toContain(UNSUPPORTED);
    expect(nodeMocksSupport(ignores, "on").reason).toMatch(/does not read it/);
    // unset: nothing to ask, whatever the build
    expect(nodeMocksSupport(ignores, null)).toEqual({ supported: true });
    expect(() => nodeMocksSupport(broken, "on")).toThrow(/throws for the requested value/);
    expect(() => nodeMocksSupport(unloadable, "on")).toThrow(/could not load the build/);
  });
});

describe("STATUS.md and the axes", () => {
  it("refuses a verdict run with --node-mocks or --ownership, and accepts the defaults", () => {
    expect(axisProblem({})).toBeNull();
    expect(axisProblem({ nodeMocks: "off" })).toMatch(/--node-mocks off/);
    expect(axisProblem({ ownershipModel: "resolver", nodeMocks: "on" })).toMatch(
      /experimental\.ownershipModel: resolver and --node-mocks on/,
    );
  });
});

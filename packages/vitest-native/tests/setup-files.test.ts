import { describe, expect, it } from "vitest";
import { placeSetupFiles } from "../src/setup-files.js";

describe("placeSetupFiles", () => {
  it("puts the files at the front of the project's list, in order", () => {
    const test = { setupFiles: ["./a.ts", "./b.ts"] };
    placeSetupFiles(test, ["/vn/setup.mjs", "/vn/ready.mjs"]);
    expect(test.setupFiles).toEqual(["/vn/setup.mjs", "/vn/ready.mjs", "./a.ts", "./b.ts"]);
  });

  it("takes a single setup file given as a string, or none", () => {
    const one: { setupFiles?: unknown } = { setupFiles: "./a.ts" };
    placeSetupFiles(one, ["/vn/setup.mjs"]);
    expect(one.setupFiles).toEqual(["/vn/setup.mjs", "./a.ts"]);
    const none: { setupFiles?: unknown } = {};
    placeSetupFiles(none, ["/vn/setup.mjs"]);
    expect(none.setupFiles).toEqual(["/vn/setup.mjs"]);
  });

  it("moves a file already listed rather than listing it twice", () => {
    const test = { setupFiles: ["./a.ts", "/vn/setup.mjs"] };
    placeSetupFiles(test, ["/vn/setup.mjs"]);
    expect(test.setupFiles).toEqual(["/vn/setup.mjs", "./a.ts"]);
  });

  it("places after the last entry `after` matches, else at the front", () => {
    const compat = (file: string) => file.endsWith("compat.mjs");
    const test = { setupFiles: ["/vn/setup.mjs", "/x/compat.mjs", "./a.ts"] };
    placeSetupFiles(test, ["/root/mocks"], compat);
    expect(test.setupFiles).toEqual(["/vn/setup.mjs", "/x/compat.mjs", "/root/mocks", "./a.ts"]);
    const without = { setupFiles: ["./a.ts"] };
    placeSetupFiles(without, ["/root/mocks"], compat);
    expect(without.setupFiles).toEqual(["/root/mocks", "./a.ts"]);
  });

  it("runs the setup files in order under sequence.setupFiles: 'parallel'", () => {
    const parallel = { setupFiles: ["./a.ts"], sequence: { setupFiles: "parallel" } };
    placeSetupFiles(parallel, ["/vn/setup.mjs"]);
    expect(parallel.sequence.setupFiles).toBe("list");
    const unset: { setupFiles: string[]; sequence?: { setupFiles?: unknown } } = {
      setupFiles: [],
      sequence: {},
    };
    placeSetupFiles(unset, ["/vn/setup.mjs"]);
    expect(unset.sequence).toEqual({});
  });
});

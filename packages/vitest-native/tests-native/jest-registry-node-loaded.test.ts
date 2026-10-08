/**
 * Project files Node loads — through require(), or what a required module requires —
 * behave as they would under Jest and Metro.
 */
import { describe, expect, it } from "vitest";
import legacy from "./fixtures/alias-app/registry/cjs/legacy.js";
import * as flags from "./fixtures/alias-app/registry/flags";
import { readFlag } from "./fixtures/alias-app/registry/reads-flag";

describe("a CommonJS project file the test imported", () => {
  // Vite evaluates it with `module.exports` as a `default` data property; handing that
  // namespace to Node would make `require` return an object instead of the function.
  it("is what module.exports was set to when required", () => {
    expect(legacy()).toBe("legacy");
    const required = require("./fixtures/alias-app/registry/cjs/legacy.js");
    expect(typeof required).toBe("function");
    expect(required()).toBe("legacy");
  });

  it("is callable from a Node-loaded module that requires it", () => {
    expect(require("./fixtures/alias-app/registry/cjs/uses-legacy.js")()).toBe("legacy");
  });
});

describe("an ES module the test imported", () => {
  it("can be assigned through require(), and the file's importers see it", () => {
    // babel-jest compiles exports to a writable object every importer reads.
    const required = require("./fixtures/alias-app/registry/flags");
    required.FLAG = true;
    expect(flags.FLAG).toBe(true);
    expect(readFlag()).toBe(true);
  });
});

describe("relative requires from a Node-loaded project file", () => {
  it("resolve in Metro's platform-extension order, files and directory indexes", () => {
    expect(require("./fixtures/alias-app/registry/uses-platform").resolved()).toEqual([
      "native",
      "ios",
    ]);
  });
});

describe("Vitest's worker state, which the registry depends on", () => {
  // Without it the registry falls back to separate copies, with a warning. Asserted
  // here so a Vitest release that moves it fails by name on every matrix leg.
  it("exposes the evaluated module graph and the running test file", () => {
    const worker = (globalThis as Record<string, any>).__vitest_worker__;
    expect(typeof worker.evaluatedModules.getModulesByFile).toBe("function");
    expect(worker.evaluatedModules.idToModuleMap).toBeInstanceOf(Map);
    expect(worker.filepath.replace(/\\/g, "/")).toMatch(/jest-registry-node-loaded\.test\.ts$/);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { nodeDefaultConditions } from "../src/native/shared-resolver.mjs";
// @ts-expect-error — runtime .mjs, no types
import { registryKey } from "../src/native/registry.mjs";

// Under experimental.ownershipModel the precompiled registry resolves React Native's
// bare requests with the shared resolver when it is BUILT, and bakes in what it answers:
// the file Node's require hook would answer at run time, with no resolution in the
// worker (the run-time externals cost ~200 resolutions per worker, per file on the stock
// path). `rn-field-lib` has no `exports` and a `react-native` field: Node's require
// alone takes `main`, the shared resolver the field.

const fixture = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-reg-shared-"));
afterAll(() => fs.rmSync(fixture, { recursive: true, force: true }));

function write(file: string, source: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

const modules = path.join(fixture, "node_modules");
write(path.join(fixture, "package.json"), JSON.stringify({ name: "shared-app" }));
write(
  path.join(modules, "react-native", "package.json"),
  JSON.stringify({ name: "react-native", version: "0.0.0" }),
);
write(
  path.join(modules, "react-native", "index.js"),
  `module.exports = { lib: require("rn-field-lib"), aliased: require("~aliased/value") };\n`,
);
write(
  path.join(modules, "rn-field-lib", "package.json"),
  JSON.stringify({ name: "rn-field-lib", main: "./main.js", "react-native": "./native.js" }),
);
write(path.join(modules, "rn-field-lib", "main.js"), `module.exports = "main";\n`);
write(path.join(modules, "rn-field-lib", "native.js"), `module.exports = "react-native field";\n`);
write(path.join(fixture, "src", "value.js"), `module.exports = "aliased source";\n`);

const inputs = {
  projectRoot: fixture,
  platform: "ios",
  preserveSymlinks: false,
  aliases: [[{ source: "^~aliased/(.*)$", flags: "" }, `${fixture}/src/$1`]],
  conditions: [...nodeDefaultConditions(process.features)].sort(),
};

const registry = pathToFileURL(path.resolve(import.meta.dirname, "../src/native/registry.mjs"));
function build(resolverInputs: object | undefined) {
  const script = `
    import { createRequire } from "node:module";
    import fs from "node:fs";
    import { buildRegistry } from ${JSON.stringify(registry.href)};
    const root = ${JSON.stringify(fixture)};
    const file = buildRegistry({
      projectRoot: root,
      platform: "ios",
      failOnError: true,
      resolverInputs: ${JSON.stringify(resolverInputs)},
    });
    let rn;
    try { rn = createRequire(root + "/package.json")(file); } catch (error) { rn = { error: error.code }; }
    console.log(JSON.stringify({ rn, falseTargets: /"[^"]+":false/.test(fs.readFileSync(file, "utf8")) }));
  `;
  const proc = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 60_000,
  });
  expect(proc.status, proc.stderr).toBe(0);
  return JSON.parse(proc.stdout.trim().split("\n").at(-1)!);
}

describe("the precompiled registry under experimental.ownershipModel", () => {
  it("bakes in the shared resolver's answers, resolved when it is built", () => {
    const built = build(inputs);
    expect(built.rn).toEqual({ lib: "react-native field", aliased: "aliased source" });
    expect(built.falseTargets).toBe(false);
  });

  it("bakes in Node's answers without the flag", () => {
    expect(build(undefined).rn).toEqual({ error: "MODULE_NOT_FOUND" });
  });

  it("is keyed by the resolver inputs, and unchanged without them", () => {
    const base = { projectRoot: fixture, platform: "ios", reactNativeVersion: "0.0.0" };
    const withInputs = registryKey({ ...base, resolverInputs: inputs });
    expect(withInputs).not.toBe(registryKey(base));
    expect(registryKey({ ...base, resolverInputs: { ...inputs, platform: "android" } })).not.toBe(
      withInputs,
    );
    expect(registryKey({ ...base, resolverInputs: undefined })).toBe(registryKey(base));
  });

  it("is shared by projects whose inputs differ only in their root", () => {
    const base = { projectRoot: fixture, platform: "ios", reactNativeVersion: "0.0.0" };
    expect(
      registryKey({
        ...base,
        resolverInputs: { ...inputs, projectRoot: path.join(fixture, "sub") },
      }),
    ).toBe(registryKey({ ...base, resolverInputs: inputs }));
  });

  it("fails by name when the shared resolver errs during the walk", () => {
    // ./loop.js is a symlink to itself: resolving it is ELOOP, an error, not "not installed".
    const loopDir = path.join(modules, "loop-lib");
    write(
      path.join(loopDir, "package.json"),
      JSON.stringify({ name: "loop-lib", exports: "./loop.js" }),
    );
    fs.symlinkSync("loop.js", path.join(loopDir, "loop.js"));
    const index = path.join(modules, "react-native", "index.js");
    const original = fs.readFileSync(index, "utf8");
    fs.writeFileSync(index, `${original}require("loop-lib");\n`);
    try {
      const proc = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import { buildRegistry } from ${JSON.stringify(registry.href)};
           try {
             buildRegistry({ projectRoot: ${JSON.stringify(fixture)}, platform: "ios", failOnError: true,
               resolverInputs: ${JSON.stringify({ ...inputs, platform: "android" })} });
             console.log("built");
           } catch (error) { console.log(error.message); }`,
        ],
        { cwd: fixture, encoding: "utf8", timeout: 60_000 },
      );
      expect(proc.stdout).toMatch(/shared resolver failed while the registry was built: loop-lib/);
    } finally {
      fs.writeFileSync(index, original);
      fs.rmSync(loopDir, { recursive: true, force: true });
    }
  });
});

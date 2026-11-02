import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// A module the precompiled registry serves must resolve `import()` against its own
// file, as Node's loader does, and without an experimental Node API: that printed an
// ExperimentalWarning into the user's output once per worker. Such a module takes a
// different compile path from the rest of the registry (see emit in registry.mjs), so
// both paths must give Node's frames, strictness and `this`.

const fixture = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-reg-import-"));
afterAll(() => fs.rmSync(fixture, { recursive: true, force: true }));

function write(file: string, source: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

const rn = path.join(fixture, "node_modules", "react-native");
write(path.join(fixture, "package.json"), JSON.stringify({ name: "import-app" }));
write(path.join(rn, "package.json"), JSON.stringify({ name: "react-native", version: "0.0.0" }));
const probes = (name: string) => `
  exports.name = ${JSON.stringify(name)};
  exports.topThis = this === module.exports;
  exports.frame = new Error("probe").stack.split("\\n")[1].replace(/^.*[\\\\/]/, "");
  exports.frozenWrite = (() => {
    try {
      Object.freeze({ v: 1 }).v = 2;
      return "silent";
    } catch (error) {
      return "threw " + error.constructor.name;
    }
  })();
  exports.plainThis = (function () { return this === globalThis ? "global" : String(this); })();
`;
const plain = ["PlainA", "PlainB", "PlainC", "PlainD"];
write(
  path.join(rn, "index.js"),
  `const lazy = require("./Libraries/Lazy");\n` +
    `lazy.all = [lazy, require("./Libraries/LazyStrict"), ${plain
      .map((name) => `require("./Libraries/${name}")`)
      .join(", ")}];\n` +
    `module.exports = lazy;\n`,
);
write(
  path.join(rn, "Libraries", "Lazy.js"),
  `${probes("Lazy")}\nexports.sibling = require("./PlainA");\n` +
    `exports.load = () => import("./value.mjs").then((m) => m.value);\n`,
);
write(
  path.join(rn, "Libraries", "LazyStrict.js"),
  `"use strict";\n${probes("LazyStrict")}\nexports.load = () => import("./value.mjs");\n`,
);
plain.forEach((name, i) =>
  write(
    path.join(rn, "Libraries", `${name}.js`),
    `${i % 2 === 0 ? "" : '"use strict";\n'}${probes(name)}`,
  ),
);
write(path.join(rn, "Libraries", "value.mjs"), `export const value = "from value.mjs";\n`);

function run(script: string) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 30_000,
  });
}

const registry = pathToFileURL(path.resolve(import.meta.dirname, "../src/native/registry.mjs"));
const load = (through: "registry" | "node") => `
  import { createRequire } from "node:module";
  import { buildRegistry } from ${JSON.stringify(registry.href)};
  const root = ${JSON.stringify(fixture)};
  const req = createRequire(root + "/package.json");
  const rn = ${JSON.stringify(through)} === "registry"
    ? req(buildRegistry({ projectRoot: root, platform: "ios", failOnError: true }))
    : req("react-native");
`;
// sameSibling: the import() module's own require reaches the same PlainA instance.
const summary = `
  const summary = rn.all.map(({ name, topThis, frame, frozenWrite, plainThis }) =>
    ({ name, topThis, frame, frozenWrite, plainThis }));
  summary.push({ sameSibling: rn.sibling === rn.all[2] });
`;

describe("precompiled registry: dynamic import()", () => {
  it("gives a module with import() and the plain modules Node's frames, strictness and this", () => {
    const node = run(`${load("node")}${summary}process.stdout.write(JSON.stringify(summary));`);
    const served = run(`${load("registry")}${summary}
      if (!rn.__vitestNativeRegistry) throw new Error("not served by the registry");
      process.stdout.write(JSON.stringify(summary));`);
    expect(served.stderr).toBe("");
    const expected = JSON.parse(node.stdout);
    // The fixture discriminates: sloppy and strict modules on both compile paths.
    expect(expected.at(-1)).toEqual({ sameSibling: true });
    expect(expected.slice(0, -1).map((m: { frozenWrite: string }) => m.frozenWrite)).toEqual([
      "silent",
      "threw TypeError",
      "silent",
      "threw TypeError",
      "silent",
      "threw TypeError",
    ]);
    expect(expected[0].frame).toMatch(/^Lazy\.js:\d+:\d+\)$/);
    expect(JSON.parse(served.stdout)).toEqual(expected);
  });

  it("reruns a plain module after a reset without compiling it again", () => {
    const result = run(`${load("registry")}
      const registry = rn.__vitestNativeRegistry;
      const first = registry.compiles();
      registry.reset();
      registry.load(0);
      process.stdout.write(JSON.stringify({ first, again: registry.compiles() - first }));`);
    expect(result.stderr).toBe("");
    // Six modules plus the entry compile once; after the reset only the two modules
    // that use import() go through Node's loader again.
    expect(JSON.parse(result.stdout)).toEqual({ first: 7, again: 2 });
  });

  it("resolves a relative import() from the module's own file, with no warning", () => {
    const result = run(`${load("registry")}
      if (!rn.__vitestNativeRegistry) throw new Error("not served by the registry");
      process.stdout.write(await rn.load());`);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("from value.mjs");
  });
});

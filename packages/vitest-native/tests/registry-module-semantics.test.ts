import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// The precompiled registry must run each React Native module with the semantics Node
// gives the same file: sloppy unless the module opens with "use strict", and `this` at
// the top level = module.exports. React Native's Babel preset compiles with
// strictMode: false, so most of its modules have no directive. A file-level directive
// in the registry made all of them strict, so a write to a frozen object threw under
// vitest-native and failed silently under Jest.
//
// The fixture is a stand-in react-native package whose modules are plain CommonJS (no
// Flow, so the registry inlines them verbatim). Each probe runs in a fresh Node process
// twice, once through the registry and once through Node's own require, and the answers
// must agree.

const fixture = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-reg-semantics-"));
afterAll(() => fs.rmSync(fixture, { recursive: true, force: true }));

const probes = `
  function frozenWrite() {
    const target = Object.freeze({ value: 1 });
    try {
      target.value = 2;
      return "silent";
    } catch (error) {
      return "threw " + error.constructor.name;
    }
  }
  function plainThis() {
    return (function () {
      return this === globalThis ? "global" : String(this);
    })();
  }
`;

function write(file: string, source: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

const rn = path.join(fixture, "node_modules", "react-native");
write(path.join(fixture, "package.json"), JSON.stringify({ name: "semantics-app" }));
write(path.join(rn, "package.json"), JSON.stringify({ name: "react-native", version: "0.0.0" }));
write(
  path.join(rn, "index.js"),
  `module.exports = { sloppy: require("./Sloppy"), strict: require("./Strict"), top: require("./TopThis") };\n`,
);
write(
  path.join(rn, "Sloppy.js"),
  `${probes}\nmodule.exports = { frozenWrite: frozenWrite(), plainThis: plainThis() };\n`,
);
write(
  path.join(rn, "Strict.js"),
  `"use strict";\n${probes}\nmodule.exports = { frozenWrite: frozenWrite(), plainThis: plainThis() };\n`,
);
write(path.join(rn, "TopThis.js"), `exports.isExports = this === module.exports;\n`);

function observe(through: "registry" | "node"): unknown {
  const registry = pathToFileURL(path.resolve(import.meta.dirname, "../src/native/registry.mjs"));
  const script = `
    import { createRequire } from "node:module";
    import { buildRegistry } from ${JSON.stringify(registry.href)};
    const root = ${JSON.stringify(fixture)};
    const req = createRequire(root + "/package.json");
    let rn;
    if (${JSON.stringify(through)} === "registry") {
      const file = buildRegistry({ projectRoot: root, platform: "ios", failOnError: true });
      rn = req(file);
      if (!rn.__vitestNativeRegistry) throw new Error("not served by the registry");
    } else {
      rn = req("react-native");
    }
    process.stdout.write(JSON.stringify(rn));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 30_000,
  });
  return JSON.parse(output);
}

describe("precompiled registry: module semantics", () => {
  it("runs each module with the strictness and `this` Node gives it", () => {
    const node = observe("node");
    // The fixture discriminates: Node runs the two modules differently.
    expect(node).toEqual({
      sloppy: { frozenWrite: "silent", plainThis: "global" },
      strict: { frozenWrite: "threw TypeError", plainThis: "undefined" },
      top: { isExports: true },
    });
    expect(observe("registry")).toEqual(node);
  });
});

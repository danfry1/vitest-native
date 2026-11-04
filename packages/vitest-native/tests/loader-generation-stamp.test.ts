import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { writeProjectContext } from "../src/context.mjs";
import { initialize, resolveSync } from "../src/native/loader.mjs";
import { createNativeOwnershipPolicy } from "../src/native/ownership.mjs";

// Under the hot runtime the loader stamps a per-file generation (?vnhot=N) on what Node
// should evaluate again in the next test file. Outside node_modules that is decided by
// the ownership policy, not by where the file sits: a workspace library Node loads and
// resets per file is stamped; the project's own source (Vite's), a vendored React Native
// and anything the policy does not give Node, such as a linked engine or test runner,
// are not. Inside node_modules the rule is unchanged.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-generation-stamp-")));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const write = (rel: string, source = "") => {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  return target;
};
const pkg = (rel: string, name: string) => write(`${rel}/package.json`, JSON.stringify({ name }));

write("package.json", JSON.stringify({ name: "app", dependencies: { "@ws/lib": "*" } }));
write("src/app.ts");
pkg("packages/lib", "@ws/lib");
write("packages/lib/src/index.ts");
fs.mkdirSync(path.join(root, "node_modules/@ws"), { recursive: true });
fs.symlinkSync(
  path.join(root, "packages/lib"),
  path.join(root, "node_modules/@ws/lib"),
  process.platform === "win32" ? "junction" : "dir",
);
pkg("vendor/react-native", "react-native");
write("vendor/react-native/index.js");
write("tools/vitest-native/dist/index.mjs");
for (const name of ["plain-pkg", "react", "react-native", "vitest", "chai"]) {
  pkg(`node_modules/${name}`, name);
  write(`node_modules/${name}/index.js`);
}

const policy = createNativeOwnershipPolicy({
  projectRoot: root,
  projectDirs: [path.join(root, "src")],
  ecosystemPackages: ["@ws/lib"],
  reactNativeRoots: [path.join(root, "vendor/react-native")],
});
const generation = new Int32Array(new SharedArrayBuffer(4));
generation[0] = 1;
initialize({
  projectRoot: root,
  platform: "ios",
  transformPkgs: [...policy.nodeTransformPackages],
  hotGenerationBuffer: generation.buffer,
  context: writeProjectContext(
    { platform: "ios", diagnostics: false, projectRoot: root, ownership: policy.manifest() },
    path.join(root, ".cache"),
  ),
});

const stamped = (rel: string) => {
  const url = pathToFileURL(path.join(root, rel)).href;
  const resolved = resolveSync(url, { parentURL: undefined, conditions: ["import"] }, () => ({
    url,
  }));
  return /[?&]vnhot=1$/.test(resolved.url);
};

describe("hot generation stamp", () => {
  it("stamps a workspace library that Node loads and resets per file", () => {
    expect(policy.decideFile(path.join(root, "packages/lib/src/index.ts")).owner).toBe("node");
    expect(stamped("packages/lib/src/index.ts")).toBe(true);
  });

  it("does not stamp a file outside node_modules that Node does not own per file", () => {
    expect(stamped("src/app.ts")).toBe(false);
    expect(stamped("vendor/react-native/index.js")).toBe(false);
    expect(stamped("tools/vitest-native/dist/index.mjs")).toBe(false);
  });

  it("keeps the node_modules rule: packages stamped, the resident runtime not", () => {
    expect(stamped("node_modules/plain-pkg/index.js")).toBe(true);
    for (const name of ["react", "react-native", "vitest", "chai"]) {
      expect(stamped(`node_modules/${name}/index.js`), name).toBe(false);
    }
  });
});

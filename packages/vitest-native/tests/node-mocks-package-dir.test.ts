// experimental.nodeMocks compares a mock's file and a requester's file by the package they
// belong to (jest-compat/node-registry.mjs): installed, by its node_modules directory; a
// workspace package linked to source, by its nearest package.json that names a package.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs
import { _packageDirOf } from "../src/jest-compat/node-registry.mjs";

const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-package-dir-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const posix = (p: string) => p.split(path.sep).join("/");

it("is the node_modules directory of an installed package", () => {
  const file = path.join(root, "node_modules", "@scope", "pkg", "lib", "index.js");
  expect(_packageDirOf(file)).toBe(posix(path.join(root, "node_modules", "@scope", "pkg")));
});

it("is the directory of the nearest named package.json for a workspace package", () => {
  const pkg = path.join(root, "packages", "foo");
  fs.mkdirSync(path.join(pkg, "lib", "commonjs"), { recursive: true });
  fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "foo" }));
  // A nested package.json without a name (a "type" marker) is not a package.
  fs.writeFileSync(
    path.join(pkg, "lib", "commonjs", "package.json"),
    JSON.stringify({ type: "commonjs" }),
  );
  expect(_packageDirOf(path.join(pkg, "lib", "commonjs", "index.js"))).toBe(posix(pkg));
  expect(_packageDirOf(path.join(pkg, "src", "index.ts"))).toBe(posix(pkg));
});

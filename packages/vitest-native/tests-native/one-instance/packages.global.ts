// Packages the one-instance tests need in node_modules, created for the run and removed
// after it (node_modules is not committed):
// - an installed `vn-fp-probe` at the package root, and a link of the same name in
//   fixtures/fp-app/node_modules to the workspace source in fixtures/fp-src;
// - an installed `vn-alias-probe` that exports only ".", whose `/feature` subpath the
//   config aliases to a project file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const installed = (name: string) => path.join(packageRoot, "node_modules", name);
const appModules = path.join(here, "fixtures", "fp-app", "node_modules");
const created = [installed("vn-fp-probe"), installed("vn-alias-probe"), appModules];

function writePackage(dir: string, manifest: object, index: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, "index.js"), index);
}

export function setup() {
  teardown();
  writePackage(
    installed("vn-fp-probe"),
    { name: "vn-fp-probe", version: "1.0.0", main: "index.js" },
    'exports.state = { value: "installed copy" };\n',
  );
  writePackage(
    installed("vn-alias-probe"),
    { name: "vn-alias-probe", version: "1.0.0", exports: { ".": "./index.js" } },
    "exports.installed = true;\n",
  );
  fs.mkdirSync(appModules, { recursive: true });
  fs.symlinkSync(
    path.join(here, "fixtures", "fp-src"),
    path.join(appModules, "vn-fp-probe"),
    process.platform === "win32" ? "junction" : "dir",
  );
}

export function teardown() {
  for (const target of created) fs.rmSync(target, { recursive: true, force: true });
}

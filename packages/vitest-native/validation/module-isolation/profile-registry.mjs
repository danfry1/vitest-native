import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "../../src/native/registry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const require = createRequire(path.join(packageRoot, "package.json"));
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-profile-"));
const nodeModules = path.join(projectRoot, "node_modules");
fs.mkdirSync(nodeModules);

function packageDirectory(name) {
  const manifest = require.resolve(`${name}/package.json`);
  return path.dirname(manifest);
}

function linkPackage(name) {
  const destination = path.join(nodeModules, ...name.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.symlinkSync(packageDirectory(name), destination, "dir");
}

for (const name of ["@babel/core", "@react-native/babel-preset", "react", "react-native"]) {
  linkPackage(name);
}
fs.writeFileSync(
  path.join(projectRoot, "package.json"),
  `${JSON.stringify({ name: "registry-profile", private: true }, null, 2)}\n`,
);

const before = process.memoryUsage();
const started = performance.now();
const registryFile = buildRegistry({
  projectRoot,
  platform: "ios",
  reactNativeVersion: require("react-native/package.json").version,
  assetExts: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
  diagnostics: true,
});
const after = process.memoryUsage();
for (let index = 0; index < 3; index++) globalThis.gc?.();
const afterGc = process.memoryUsage();

console.log(
  JSON.stringify(
    {
      projectRoot,
      registryFile,
      durationMs: Math.round(performance.now() - started),
      before,
      after,
      afterGc,
      registryBytes: registryFile ? fs.statSync(registryFile).size : 0,
    },
    null,
    2,
  ),
);

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(packageRoot, "consumer-tests");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-native-consumers-"));
const packRoot = path.join(tempRoot, "package");
fs.mkdirSync(packRoot);

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_ignore_scripts: "true",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
}

function addPackedDependency(fixtureRoot, tarball) {
  const packagePath = path.join(fixtureRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  manifest.devDependencies = {
    ...manifest.devDependencies,
    "vitest-native": `file:${tarball.replaceAll("\\", "/")}`,
  };
  fs.writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

try {
  run("npm", ["pack", "--ignore-scripts", "--pack-destination", packRoot], packageRoot);
  const tarballName = fs.readdirSync(packRoot).find((name) => name.endsWith(".tgz"));
  if (!tarballName) throw new Error("npm pack did not produce a tarball");
  const tarball = path.join(packRoot, tarballName);

  for (const fixture of ["bare", "expo", "monorepo", "current-rn"]) {
    const fixtureRoot = path.join(tempRoot, fixture);
    fs.cpSync(path.join(fixturesRoot, fixture), fixtureRoot, { recursive: true });
    addPackedDependency(fixtureRoot, tarball);
    run("npm", ["install"], fixtureRoot);
    run("npm", ["test"], fixtureRoot);
  }

  console.log("\nAll packed consumer fixtures passed.");
} finally {
  fs.rmSync(tempRoot, { force: true, recursive: true });
}

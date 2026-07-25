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

  for (const fixture of ["bare", "expo", "monorepo", "current-rn", "mock-rntl14"]) {
    const fixtureRoot = path.join(tempRoot, fixture);
    fs.cpSync(path.join(fixturesRoot, fixture), fixtureRoot, { recursive: true });
    addPackedDependency(fixtureRoot, tarball);
    run("npm", ["install"], fixtureRoot);
    run("npm", ["test"], fixtureRoot);
  }

  // The CLI ships as the package bin — prove it dispatches from the packed
  // tarball the way `npx vitest-native` would (doctor exercises peer probing,
  // engine detection, and preset scanning against the fixture's real installs;
  // migrate analyzes a minimal Jest config planted for the smoke).
  const cliFixture = path.join(tempRoot, "bare");
  run("npx", ["--no-install", "vitest-native", "doctor"], cliFixture);

  // `init` writes the config a new user starts from, so run a suite against exactly
  // what it produces rather than only asserting on its text. Nothing executed the
  // generated config before — every fixture shipped a hand-written one, so the first
  // command a user runs was the least covered thing in the package.
  //
  // Installed from the SOURCE fixture, not copied from the installed one: copying an
  // installed tree breaks it (the packed dependency is linked, and React ends up
  // duplicated), which fails with the null-hooks-dispatcher error and reads exactly
  // like a broken generated config.
  const initFixture = path.join(tempRoot, "init-generated");
  fs.cpSync(path.join(fixturesRoot, "bare"), initFixture, { recursive: true });
  for (const name of fs.readdirSync(initFixture)) {
    if (name.startsWith("vitest.config.")) fs.rmSync(path.join(initFixture, name));
  }
  addPackedDependency(initFixture, tarball);
  run("npm", ["install"], initFixture);
  // The bare fixture's suite uses jest globals, so it needs the jest-compat shape.
  run("npx", ["--no-install", "vitest-native", "init", "--jest-compat"], initFixture);
  run("npm", ["test"], initFixture);

  fs.writeFileSync(
    path.join(cliFixture, "jest.config.json"),
    `${JSON.stringify({ preset: "react-native", testTimeout: 10000 }, null, 2)}\n`,
  );
  run("npx", ["--no-install", "vitest-native", "migrate"], cliFixture);

  // The same treatment for `migrate --write`, whose template has far more moving
  // parts than init's: a setup file, an alias derived from moduleNameMapper, a
  // transform list, and passed-through test options. It was checked only against
  // expected substrings, which is how a `<rootDir>` token reached the emitted
  // setupFiles — Vitest does not substitute it, so every test file failed to load.
  // The fixture's jest.config.json is written the way a real project writes one, and
  // its suite asserts on what the generated config is supposed to deliver.
  const migrateFixture = path.join(tempRoot, "jest-migration");
  fs.cpSync(path.join(fixturesRoot, "jest-migration"), migrateFixture, { recursive: true });
  addPackedDependency(migrateFixture, tarball);
  run("npm", ["install"], migrateFixture);
  run("npx", ["--no-install", "vitest-native", "migrate", "--write"], migrateFixture);
  run("npm", ["test"], migrateFixture);

  console.log("\nAll packed consumer fixtures passed.");
} finally {
  fs.rmSync(tempRoot, { force: true, recursive: true });
}

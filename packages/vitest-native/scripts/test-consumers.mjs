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

/**
 * The monorepo fixture under pnpm.
 *
 * pnpm's layout is materially different from npm's: nothing is hoisted, packages are
 * symlinked out of a content store, and every workspace member is additionally linked
 * into a hidden directory that pnpm puts on NODE_PATH — which is how a package comes
 * to resolve its own name from its own directory. Every monorepo defect reported so
 * far arrived from pnpm, and an npm fixture cannot represent any of that.
 *
 * The packed dependency goes into each member as well as the root, because without
 * hoisting a member cannot see what only the root declares.
 */
function runPnpmMonorepo(tarball) {
  const fixtureRoot = path.join(tempRoot, "monorepo-pnpm");
  fs.cpSync(path.join(fixturesRoot, "monorepo-pnpm"), fixtureRoot, { recursive: true });
  const members = ["apps/mobile", "packages/ui"].map((rel) => path.join(fixtureRoot, rel));
  for (const dir of [fixtureRoot, ...members]) addPackedDependency(dir, tarball);

  const pnpm = ["--yes", "pnpm@10"];
  run("npx", [...pnpm, "install", "--no-frozen-lockfile"], fixtureRoot);
  // The app's suite, the Nx-style run from the workspace root, and the library's own
  // suite from inside it — the three invocations the reports came from.
  for (const script of ["test", "test:from-root", "test:library"]) {
    run("npx", [...pnpm, "run", script], fixtureRoot);
  }
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
    // The hot runtime from the packed install. In-repo, the engine and the
    // validation suites live OUTSIDE node_modules, so the hot loader's
    // node_modules-scoped generation stamp can never touch the engine or Vitest's
    // own runtime there — a twin-runtime defect (stamped @vitest/snapshot, stamped
    // vi) passes every workspace gate and burns only real installs. This leg is the
    // only gate that loads the hot runtime the way a consumer does.
    if (fixture === "current-rn") {
      // npm installs the fixture's local probe packages as SYMLINKS (and npm 11
      // dropped install-links), whose real path sits outside node_modules — where
      // the hot loader's node_modules-scoped generation stamp would (correctly)
      // never apply. A registry install would copy them, so make it one: replace
      // the links with real directories before the hot leg runs.
      for (const [dir, name] of [
        ["state-fixture", "consumer-state-fixture"],
        ["runtime-probe", "runtime-probe"],
      ]) {
        const dest = path.join(fixtureRoot, "node_modules", name);
        fs.rmSync(dest, { recursive: true, force: true });
        fs.cpSync(path.join(fixtureRoot, dir), dest, { recursive: true });
      }
      run("npm", ["run", "test:hot"], fixtureRoot);
    }
    // The monorepo fixture is also run from the WORKSPACE ROOT, pointing at the
    // app's config. That is how Nx invokes tasks, and Vitest's root follows the
    // working directory, so the run root ends up above the package under test.
    // Package detection walks manifests UPWARDS, so from there it saw none of the
    // app's own dependencies: the workspace library missed auto-detection, stayed
    // in Vite's graph while Node loaded it too, and came apart into two module
    // instances — the reported blocker reproducing from nothing but a different
    // working directory. Running only from the app directory could not see it.
    if (fixture === "monorepo") {
      run("npm", ["run", "test:from-root"], fixtureRoot);
      // And the workspace LIBRARY's own tests, from inside it. The app depending on
      // it is what makes it look like an ecosystem package, so detection claimed the
      // project's own source: Vitest externalized this directory, Node compiled the
      // test files to CommonJS, and their `import { it } from 'vitest'` became
      // `require('vitest')`, which throws before a single test runs. Which package a
      // suite lives in decided whether it worked, so running only the app's suite —
      // from either directory — could not see it.
      run("npm", ["run", "test:library"], fixtureRoot);
    }
  }

  // The same monorepo under pnpm. Its layout is materially different — no hoisting,
  // a symlinked store, and every workspace member linked into a hidden directory that
  // pnpm puts on NODE_PATH, so a package resolves its own name from its own
  // directory. Both monorepo reports so far came from pnpm, and the fixture above
  // could not represent it. `test:from-root` covers the Nx-style invocation, and
  // `test:library` the package the run lives in.
  runPnpmMonorepo(tarball);

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

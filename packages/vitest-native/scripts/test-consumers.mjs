import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./release-age.mjs";
import { CANARY_INSTALL_FLAGS } from "./release-age.mjs";
import { HERO_RUN, HERO_TEST, heroRunLines, writeSnippets } from "./doc-snippets.mjs";
import { scratchInstall } from "./scratch-install.mjs";
import { floorBannerProblem } from "./support/engine-banner.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(packageRoot, "consumer-tests");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-native-consumers-"));
const packRoot = path.join(tempRoot, "package");
fs.mkdirSync(packRoot);

/**
 * A package's installed bin in `root`'s node_modules, as the script for Node to run: the
 * fixture's own copy, never npx, which resolves a missing one from the registry.
 */
function installedBin(root, name, bin = name) {
  const dir = path.join(root, "node_modules", name);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[bin];
  if (!entry) throw new Error(`${name} has no "${bin}" bin in ${dir}`);
  return path.join(dir, entry);
}

/**
 * Runs the `vitest-native` command npm linked when it installed the packed tarball, the
 * way a user's package script or `npx vitest-native` reaches it. installedBin() reads the
 * manifest's path and runs that file directly, so it passes even when npm linked no
 * command: npm rewrites a bin entry while publishing and drops one it cannot use.
 */
function runLinkedBin(root) {
  const manifestPath = path.join(root, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.scripts = { ...manifest.scripts, "vitest-native-bin": "vitest-native --help" };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const output = runCaptured("npm", ["run", "--silent", "vitest-native-bin"], root);
  if (!output.includes("Usage:\n  vitest-native init")) {
    throw new Error("the linked vitest-native command did not print its usage");
  }
}

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

/** Like run(), but also returns the combined output, for assertions on the banner. */
function runCaptured(command, args, cwd, env = {}) {
  console.log(
    `\n> ${Object.entries(env)
      .map(([k, v]) => `${k}=${v} `)
      .join("")}${command} ${args.join(" ")}`,
  );
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_ignore_scripts: "true",
      ...env,
    },
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

// pnpm for the pnpm-layout fixtures. VN_PNPM names a pnpm already on the machine
// (space-separated command); otherwise npx fetches the pinned pnpm, as in CI.
const pnpmCommand = process.env.VN_PNPM
  ? process.env.VN_PNPM.split(" ")
  : // An exact release, as for every other dependency these gates install: a floating
    // `pnpm@10` would run whatever pnpm published last, inside a required check.
    ["npx", "--yes", "pnpm@10.34.9"];
function pnpm(args, cwd) {
  run(pnpmCommand[0], [...pnpmCommand.slice(1), ...args], cwd);
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

  pnpm(["install", "--no-frozen-lockfile"], fixtureRoot);
  // The app's suite, the Nx-style run from the workspace root, and the library's own
  // suite from inside it — the three invocations the reports came from.
  for (const script of ["test", "test:from-root", "test:library"]) {
    pnpm(["run", script], fixtureRoot);
  }
}

/**
 * A realistic Expo SDK 58 app in a pnpm workspace with its isolated layout, run the way
 * an app runs its suite: per-file isolation (the default) and `hotRuntime: 'auto'`, on
 * iOS and Android, with expo-router's own testing library, and a workspace library that
 * declares only expo-image, tested from inside it.
 *
 * The defects that blocked real Expo suites sat where the fixtures above do not reach:
 * Expo packages reached only through another package's dependencies (expo-asset under
 * expo-image), expo-router's Android toolbar requiring `.xml` vector drawables, and a
 * transform-cache miss after Expo's runtime is installed, which only a warm second run
 * produces. Each has a test here (consumer-tests/expo-pnpm-suite).
 */
// The fixture pins Expo SDK 58. SDK 57 is the previous SDK, which most projects on
// `latest` still run; the same fixture installs it with these pins (the expo-sdk57
// fixture's), on RNTL 13.
const EXPO_SDK57 = {
  "@testing-library/react-native": "13.3.3",
  expo: "57.0.24",
  "expo-constants": "57.0.19",
  "expo-image": "57.0.5",
  "expo-linking": "57.0.10",
  "expo-router": "57.0.22",
  "expo-splash-screen": "57.0.10",
  "expo-status-bar": "57.0.1",
  "expo-symbols": "57.0.3",
  react: "19.2.4",
  "react-dom": "19.2.4",
  "react-native": "0.86.3",
  "react-native-gesture-handler": "2.32.0",
  "react-native-reanimated": "4.5.1",
  "react-native-safe-area-context": "5.7.0",
  "react-native-screens": "4.26.2",
  "react-native-worklets": "0.10.1",
  "react-test-renderer": "19.2.4",
  vite: "^8.3.4",
  vitest: "5.0.5",
};

function pinVersions(dir, pins) {
  const packagePath = path.join(dir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (pins[name]) manifest[field][name] = pins[name];
    }
  }
  fs.writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function runExpoPnpmSuite(tarball, sdk) {
  const fixtureRoot = path.join(tempRoot, `expo-pnpm-suite-sdk${sdk}`);
  fs.cpSync(path.join(fixturesRoot, "expo-pnpm-suite"), fixtureRoot, { recursive: true });
  const app = path.join(fixtureRoot, "apps/mobile");
  const library = path.join(fixtureRoot, "packages/ui");
  // A workspace package shaped like a real monorepo's: it runs @suite/ui's setup file,
  // aliases into its source and into an undeclared sibling (@suite/tokens), and reaches
  // `expo` only through @suite/ui's expo-image (consumer-tests/expo-pnpm-suite/README.md).
  const feature = path.join(fixtureRoot, "packages/feature");
  const tokens = path.join(fixtureRoot, "packages/tokens");
  for (const dir of [fixtureRoot, app, library, feature]) {
    if (sdk === 57) pinVersions(dir, EXPO_SDK57);
    addPackedDependency(dir, tarball);
  }
  if (sdk === 57) pinVersions(tokens, EXPO_SDK57);
  pnpm(["install", "--no-frozen-lockfile"], fixtureRoot);

  // Every leg runs, and the failures are reported together at the end: one run shows
  // which platform and runtime combinations a change broke, not only the first.
  const failures = [];
  const leg = (name, cwd, args, env, check = () => undefined) => {
    try {
      const output = runCaptured(
        pnpmCommand[0],
        [...pnpmCommand.slice(1), "exec", "vitest", "run", ...args],
        cwd,
        env,
      );
      const problem = check(output);
      if (problem) failures.push(`SDK ${sdk} ${name}: ${problem}`);
    } catch (error) {
      failures.push(`SDK ${sdk} ${name}: ${error.message}`);
    }
  };
  // 'auto' is only proven if the selector admitted the suite (no jest-compat, more than
  // one worker); a decline would quietly re-run the per-file leg.
  const runtimeIs = (hot) => (output) => {
    const isHot = output.includes(", hot runtime)");
    if (hot === "auto" && !isHot) return "hotRuntime 'auto' did not select the hot runtime";
    if (hot === "false" && isHot) return "hotRuntime false ran the hot runtime";
    return undefined;
  };
  for (const hot of ["false", "auto"]) {
    for (const platform of ["ios", "android"]) {
      const env = { VN_HOT: hot, VN_PLATFORM: platform };
      const name = `app (${platform}, hotRuntime ${hot})`;
      leg(name, app, [], env, runtimeIs(hot));
      // The first run fills the transform cache. The second is warm, so the fresh module
      // in warm-cache-miss.test.ts is a worker's first cache miss after setup.
      if (hot === "false" && platform === "ios") leg(`${name}, warm cache`, app, [], env);
      leg(
        `router (${platform}, hotRuntime ${hot})`,
        app,
        ["--config", "vitest.router.config.mts"],
        env,
      );
    }
    leg(`library (hotRuntime ${hot})`, library, [], { VN_HOT: hot });
    leg(`feature package (hotRuntime ${hot})`, feature, [], { VN_HOT: hot });
  }
  return failures;
}

/**
 * Reanimated at its supported floor (4.5.3, on React Native 0.86.3), with the worklets
 * Babel plugin from the project's own config (consumer-tests/reanimated-floor). On 4.5
 * and 4.6 the preset stands in for the library, and a project mock that spreads
 * `jest.requireActual` runs the real `useAnimatedStyle`, which throws without the plugin.
 * The repository does not install these versions, so the fixture goes through
 * scratch-install: its pins, the repository's resolutions, and the release cooldown.
 *
 * Each row must pass and print the engine it asked for: a silent fallback to the mock
 * engine, or a hot row that ran per-file, fails the leg.
 */
const REANIMATED_FLOOR_ROWS = [
  { config: "mock", env: { VN_HOT: "false" }, engine: "native" },
  { config: "mock", env: { VN_HOT: "true" }, engine: "native", hot: true },
  { config: "preset", env: { VN_HOT: "false" }, engine: "native" },
  { config: "preset", env: { VN_HOT: "true" }, engine: "native", hot: true },
  { config: "preset", env: { VN_HOT: "false", VN_ENGINE: "mock" }, engine: "mock" },
];

async function runLibraryFloors(tarball) {
  const fixtureRoot = path.join(tempRoot, "reanimated-floor");
  fs.cpSync(path.join(fixturesRoot, "reanimated-floor"), fixtureRoot, { recursive: true });
  addPackedDependency(fixtureRoot, tarball);
  await scratchInstall(fixtureRoot, { tarballs: [tarball] });
  const reactNativeVersion = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, "node_modules/react-native/package.json"), "utf8"),
  ).version;
  const failures = [];
  for (const row of REANIMATED_FLOOR_ROWS) {
    const name = `${row.config} config, ${Object.entries(row.env)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`;
    try {
      const output = runCaptured(
        process.execPath,
        ["node_modules/vitest/vitest.mjs", "run", "--config", `vitest.${row.config}.config.mts`],
        fixtureRoot,
        row.env,
      );
      const problem = floorBannerProblem(output, row, reactNativeVersion);
      if (problem) failures.push(`${name}: ${problem}`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Reanimated floor: ${failures.length} row(s) failed\n- ${failures.join("\n- ")}`,
    );
  }
}

function runExpoPnpmSuites(tarball) {
  const failures = [...runExpoPnpmSuite(tarball, 58), ...runExpoPnpmSuite(tarball, 57)];
  if (failures.length > 0) {
    throw new Error(
      `Expo pnpm suite: ${failures.length} leg(s) failed\n- ${failures.join("\n- ")}`,
    );
  }
}

// The supported Expo SDKs at their newest patch: the latest-supported axis for Expo
// (docs/upstream-policy.md). The fixtures pin exact releases; here `expo` follows its SDK
// (`~58.0.0`) and Expo's own `expo install --fix` aligns the packages that go with it
// (expo-*, react-native, the router). Every install keeps the repository's release
// cooldown (scripts/release-age.mjs, imported above). Expo's CLI runs offline, so the
// versions it aligns to are the installed expo release's own list (as old as that
// release), not its online API's, which names releases younger than the gate allows.
/** Each supported SDK's fixture, with `expo` following that SDK to its newest patch. */
const EXPO_LATEST = [
  { fixture: "expo", expo: "~58.0.0" },
  { fixture: "expo-sdk57", expo: "~57.0.0" },
];

/**
 * The newest SDK's fixture on the Expo prerelease in VN_EXPO_VERSION, which the canary
 * job picks (.github/scripts/canary-version.mjs).
 */
function expoNext() {
  const version = process.env.VN_EXPO_VERSION;
  if (!version)
    throw new Error("VN_CONSUMERS=expo-next needs VN_EXPO_VERSION, the expo prerelease to install");
  return [{ fixture: "expo", expo: version }];
}

/**
 * The Expo fixtures with `expo` set to each entry's version and `expo install --fix`
 * aligning the rest (expo-*, react-native, the router), as an app upgrading would.
 */
function runExpoVersions(tarball, leg, entries) {
  for (const { fixture, expo } of entries) {
    const fixtureRoot = path.join(tempRoot, `${fixture}-${leg}`);
    fs.cpSync(path.join(fixturesRoot, fixture), fixtureRoot, { recursive: true });
    if (fixture === "expo-sdk57") {
      // As in the fixtures leg: the runtime-surface reader the SDK 57 test checks.
      fs.mkdirSync(path.join(fixtureRoot, "src", "lib"), { recursive: true });
      fs.copyFileSync(
        path.join(packageRoot, "tests", "support", "expo-runtime-surface.ts"),
        path.join(fixtureRoot, "src", "lib", "expo-runtime-surface.ts"),
      );
    }
    const manifestPath = path.join(fixtureRoot, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.dependencies.expo = expo;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    addPackedDependency(fixtureRoot, tarball);
    runCaptured("npm", ["install", ...CANARY_INSTALL_FLAGS], fixtureRoot);
    // The fixture's own Expo CLI, never npx: a missing binary would resolve from the registry.
    runCaptured(
      process.execPath,
      [path.join("node_modules", "expo", "bin", "cli"), "install", "--fix"],
      fixtureRoot,
      { EXPO_OFFLINE: "1" },
    );
    // Expo aligns react but not react-test-renderer, which it does not manage;
    // RNTL refuses a renderer from another React release, and asks for exactly this.
    const reactVersion = JSON.parse(
      fs.readFileSync(path.join(fixtureRoot, "node_modules", "react", "package.json"), "utf8"),
    ).version;
    // Declared as a dependency or a dev dependency, depending on the fixture.
    const dev = Boolean(manifest.devDependencies?.["react-test-renderer"]);
    if (dev || manifest.dependencies?.["react-test-renderer"]) {
      const spec = `react-test-renderer@${reactVersion}`;
      runCaptured(
        "npm",
        ["install", ...CANARY_INSTALL_FLAGS, ...(dev ? ["-D"] : []), spec],
        fixtureRoot,
      );
    }
    const version = (name) =>
      JSON.parse(
        fs.readFileSync(path.join(fixtureRoot, "node_modules", name, "package.json"), "utf8"),
      ).version;
    console.log(
      `\n${fixture}: expo ${version("expo")}, react-native ${version("react-native")}, expo-router ${version("expo-router")}`,
    );
    run("npm", ["test"], fixtureRoot);
    run("npm", ["run", "test:router"], fixtureRoot);
  }
}

// The README's and the quick start's code, run as written (scripts/doc-snippets.mjs).
// The app is the Expo SDK 58 template fixture, on RNTL 14, whose async render() is
// what an unawaited snippet breaks. Its own config and tests are removed first, so the
// run is nothing but what the pages show.
function runDocSnippets(tarball) {
  const fixtureRoot = path.join(tempRoot, "doc-snippets");
  fs.cpSync(path.join(fixturesRoot, "expo-template"), fixtureRoot, { recursive: true });
  for (const name of fs.readdirSync(fixtureRoot)) {
    if (name.startsWith("vitest.config.")) fs.rmSync(path.join(fixtureRoot, name));
  }
  fs.rmSync(path.join(fixtureRoot, "src"), { recursive: true, force: true });
  const files = writeSnippets(fixtureRoot);
  console.log(`\ndoc snippets: ${files.join(", ")}`);
  addPackedDependency(fixtureRoot, tarball);
  run("npm", ["install"], fixtureRoot);
  // The fixture's own Vitest, never npx: a missing binary would resolve from the registry.
  const vitest = path.join("node_modules", "vitest", "vitest.mjs");
  run(process.execPath, [vitest, "run"], fixtureRoot);
  checkHeroRun(fixtureRoot, vitest);
}

// The landing page's hero shows a test and the output of running it. Both come from here:
// the test is a snippet file, and its output is committed beside it (HERO_RUN). This runs
// the test alone, as a reader would, and fails when the output the page shows (the engine
// banner, each test's line, the totals) no longer matches. VN_UPDATE_HERO_RUN=1 rewrites it.
function checkHeroRun(fixtureRoot, vitest) {
  const output = runCaptured(
    process.execPath,
    [vitest, "run", HERO_TEST, "--reporter=verbose"],
    fixtureRoot,
  );
  const lines = heroRunLines(output);
  const file = path.join(packageRoot, "../..", HERO_RUN);
  if (process.env.VN_UPDATE_HERO_RUN === "1") {
    fs.writeFileSync(file, `${lines.join("\n")}\n`);
    console.log(`\nhero run: wrote ${HERO_RUN}`);
    return;
  }
  const committed = fs.readFileSync(file, "utf8").trimEnd().split("\n");
  if (lines.join("\n") !== committed.join("\n")) {
    throw new Error(
      `the landing page's run output (${HERO_RUN}) no longer matches a run of ${HERO_TEST}.\n` +
        `committed:\n  ${committed.join("\n  ")}\nnow:\n  ${lines.join("\n  ")}\n` +
        "Rerun with VN_UPDATE_HERO_RUN=1 to record the new output, and review the page.",
    );
  }
}

try {
  run("npm", ["pack", "--ignore-scripts", "--pack-destination", packRoot], packageRoot);
  const tarballName = fs.readdirSync(packRoot).find((name) => name.endsWith(".tgz"));
  if (!tarballName) throw new Error("npm pack did not produce a tarball");
  const tarball = path.join(packRoot, tarballName);

  // VN_CONSUMERS=expo-pnpm-suite runs only the real-suite Expo workspace (its own CI
  // cell); VN_CONSUMERS=fixtures everything else, the doc snippets included;
  // VN_CONSUMERS=doc-snippets only the snippets (to run them locally, and for a
  // docs-only pull request that changes a page carrying snippets);
  // VN_CONSUMERS=library-floors only the library-floor fixtures (also in fixtures).
  // Unset runs all of them, as prepublishOnly does.
  const only = process.env.VN_CONSUMERS;
  const LEGS = [
    "fixtures",
    "doc-snippets",
    "library-floors",
    "expo-pnpm-suite",
    "expo-latest",
    "expo-next",
  ];
  if (only && !LEGS.includes(only)) {
    throw new Error(`VN_CONSUMERS=${only} is not one of ${LEGS.join(", ")}`);
  }
  // The doc snippets and the library floors run in the fixtures cell.
  const runs = (leg) =>
    !only ||
    only === leg ||
    ((leg === "doc-snippets" || leg === "library-floors") && only === "fixtures");
  if (runs("fixtures")) {
    for (const fixture of [
      "bare",
      "expo",
      "expo-sdk57",
      "expo-template",
      // jest-expo and vitest-native run the same probes, which must agree except for the
      // listed differences (consumer-tests/expo-jest-parity/parity/run.mjs).
      "expo-jest-parity",
      "monorepo",
      "current-rn",
      "mock-rntl14",
    ]) {
      const fixtureRoot = path.join(tempRoot, fixture);
      fs.cpSync(path.join(fixturesRoot, fixture), fixtureRoot, { recursive: true });
      if (fixture === "expo-sdk57") {
        // The reader of Expo's runtime surface is the unit test's; this fixture checks the
        // stand-in against SDK 57, installed only here (src/expo-runtime-surface.test.tsx).
        fs.mkdirSync(path.join(fixtureRoot, "src", "lib"), { recursive: true });
        fs.copyFileSync(
          path.join(packageRoot, "tests", "support", "expo-runtime-surface.ts"),
          path.join(fixtureRoot, "src", "lib", "expo-runtime-surface.ts"),
        );
      }
      addPackedDependency(fixtureRoot, tarball);
      run("npm", ["install"], fixtureRoot);
      run("npm", ["test"], fixtureRoot);
      // The hot runtime from the packed install. In-repo, the engine and the
      // validation suites live OUTSIDE node_modules, so the hot loader's
      // node_modules-scoped generation stamp can never touch the engine or Vitest's
      // own runtime there — a twin-runtime defect (stamped @vitest/snapshot, stamped
      // vi) passes every workspace gate and burns only real installs. This leg is the
      // only gate that loads the hot runtime the way a consumer does.
      // The Expo fixture also runs its router leg: expo-router's own testing library
      // against the real React Navigation it bundles (from SDK 57), driving
      // file-based app/ routes with testRouter — the code a jest-expo suite already
      // contains, ported verbatim. Only meaningful from a packed install, where the
      // whole Expo SDK is a real dependency graph rather than the workspace's subset.
      // `expo` tracks the current SDK; `expo-sdk57` keeps the previous one, which most
      // projects on `latest` still run and whose router predates RNTL 14's async API.
      if (fixture === "expo" || fixture === "expo-sdk57") {
        run("npm", ["run", "test:router"], fixtureRoot);
      }
      if (fixture === "expo") {
        // The same router suite under the config `migrate --write` generates from a
        // jest-expo setup, so the translation (the plugin, jest-compat, the Jest globals)
        // is proven by running it rather than by the substrings the unit tests check.
        // Last for this fixture: it replaces the fixture's own config.
        for (const name of fs.readdirSync(fixtureRoot)) {
          if (name.startsWith("vitest.config.")) fs.rmSync(path.join(fixtureRoot, name));
        }
        fs.writeFileSync(
          path.join(fixtureRoot, "jest.config.json"),
          `${JSON.stringify({ preset: "jest-expo", testMatch: ["<rootDir>/router-tests/**/*.test.tsx"] }, null, 2)}\n`,
        );
        run(
          process.execPath,
          [installedBin(fixtureRoot, "vitest-native"), "migrate", "--write"],
          fixtureRoot,
        );
        run(process.execPath, [installedBin(fixtureRoot, "vitest"), "run"], fixtureRoot);
      }
      if (fixture === "current-rn") {
        // npm installs the fixture's local probe packages as SYMLINKS (and npm 11
        // dropped install-links), whose real path sits outside node_modules — where
        // the hot loader's node_modules-scoped generation stamp would (correctly)
        // never apply. A registry install would copy them, so make it one: replace
        // the links with real directories before the hot leg runs.
        for (const [dir, name] of [
          ["state-fixture", "consumer-state-fixture"],
          ["runtime-probe", "runtime-probe"],
          ["first-load-fixture", "consumer-first-load-fixture"],
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
    runLinkedBin(cliFixture);
    run(process.execPath, [installedBin(cliFixture, "vitest-native"), "doctor"], cliFixture);

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
    run(
      process.execPath,
      [installedBin(initFixture, "vitest-native"), "init", "--jest-compat"],
      initFixture,
    );
    run("npm", ["test"], initFixture);

    fs.writeFileSync(
      path.join(cliFixture, "jest.config.json"),
      `${JSON.stringify({ preset: "react-native", testTimeout: 10000 }, null, 2)}\n`,
    );
    run(process.execPath, [installedBin(cliFixture, "vitest-native"), "migrate"], cliFixture);

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
    run(
      process.execPath,
      [installedBin(migrateFixture, "vitest-native"), "migrate", "--write"],
      migrateFixture,
    );
    run("npm", ["test"], migrateFixture);
  }
  if (runs("doc-snippets")) runDocSnippets(tarball);
  if (runs("library-floors")) await runLibraryFloors(tarball);
  if (runs("expo-pnpm-suite")) runExpoPnpmSuites(tarball);
  // Only when asked for: they install the newest Expo patches, or an Expo prerelease, so
  // they run on a schedule (compat-check.yml), never as part of a pull request's gate.
  if (only === "expo-latest") runExpoVersions(tarball, only, EXPO_LATEST);
  if (only === "expo-next") runExpoVersions(tarball, only, expoNext());

  console.log("\nThe packed consumer fixtures passed.");
} finally {
  fs.rmSync(tempRoot, { force: true, recursive: true });
}

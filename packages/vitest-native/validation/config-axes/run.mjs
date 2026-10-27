// One cell of the configuration-axis matrix (docs/config-axis-matrix.md): materialise the
// probe workspace for the cell's install axes, run the probes under each of its runtime
// combinations, and judge every result against known-failing.json (verdict.mjs).
//
//   node validation/config-axes/run.mjs --cell '<json from cells.mjs>'
//       CI. Packs vitest-native and installs the workspace from the registry: npm
//       workspaces for layout "hoisted", pnpm workspaces for "isolated".
//   node validation/config-axes/run.mjs --cell '<json>' --link-deps <node_modules>
//       [--rntl <dir of an installed @testing-library/react-native>] [--vitest-native <dir>]
//       Local, without installing anything: link the packages from an existing
//       node_modules (packages/vitest-native/node_modules is bun's isolated store, so
//       this is an isolated layout whatever the cell says), copy an RNTL other than the
//       one there, and use vitest-native from a directory (default: this package).
//
//   --keep          keep the materialised workspace and print its path
//   --only a,b      run only these probes (investigation; the verdict still applies)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applies, PROBES } from "./probes.mjs";
import { judge, readKnownFailing, validateEntries } from "./verdict.mjs";
import { cellName, readAxes } from "./cells.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const flag = (name) => process.argv.includes(`--${name}`);

const RUN_TIMEOUT_MS = 240_000;

function sh(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error && result.error.code !== "ETIMEDOUT") throw result.error;
  return {
    status: result.status,
    timedOut: result.error?.code === "ETIMEDOUT",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function must(result, what) {
  if (result.status !== 0)
    throw new Error(`${what} failed (exit ${result.status}):\n${result.output}`);
  return result;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// --- materialise --------------------------------------------------------------------

/** The version range a cell installs for `name`, from axes.json and this package's pins. */
function versionsFor(cell, axes) {
  const pins = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const pinned = (name) => pins.devDependencies[name];
  const pick = (axis, name) => {
    const range = axes.versions[axis][cell[axis]];
    return range === "lockfile" ? pinned(name) : range;
  };
  return {
    "@babel/core": pinned("@babel/core"),
    "@react-native/babel-preset": pinned("@react-native/babel-preset"),
    "@testing-library/react-native": pick("rntl", "@testing-library/react-native"),
    react: pinned("react"),
    "react-native": pinned("react-native"),
    // The preset banner probe needs a library whose preset applies under both engines.
    "react-native-safe-area-context": pinned("react-native-safe-area-context"),
    // RNTL 12 and 13 render through react-test-renderer (a peer dependency).
    "react-test-renderer": pinned("react-test-renderer"),
    vite: pinned("vite"),
    vitest: pick("vitest", "vitest"),
  };
}

const MEMBERS = ["feature", "validator", "rfeature", "rvalidator"];

function materialise(cell, axes) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-config-axes-")));
  fs.cpSync(path.join(here, "fixture"), root, { recursive: true });
  const local = argument("link-deps");
  const isolated = cell.layout === "isolated";
  // pnpm links a workspace member only through the workspace: protocol.
  const workspace = isolated && !local ? "workspace:*" : "*";

  writeJson(path.join(root, "package.json"), {
    name: "config-axes-root",
    private: true,
    workspaces: ["apps/*", "packages/*"],
  });
  const app = path.join(root, "apps/app");
  const dependencies = {
    ...versionsFor(cell, axes),
    ...Object.fromEntries(MEMBERS.map((name) => [`@axis/${name}`, workspace])),
  };

  if (local) {
    linkLocal(root, app, local);
    writeJson(path.join(app, "package.json"), {
      name: "config-axes-app",
      private: true,
      type: "module",
      dependencies: { ...dependencies, "axis-esm-lib": "1.0.0", "vitest-native": "*" },
    });
    return root;
  }

  // The ESM probe package is installed from a tarball, as a registry install copies it:
  // a `file:` directory dependency is a symlink whose real path is outside node_modules.
  const vendor = path.join(root, "vendor");
  must(
    sh("npm", ["pack", "--pack-destination", vendor], path.join(vendor, "axis-esm-lib")),
    "npm pack axis-esm-lib",
  );
  must(
    sh("npm", ["pack", "--ignore-scripts", "--pack-destination", vendor], packageRoot),
    "npm pack vitest-native",
  );
  const tarball = (prefix) => {
    const name = fs.readdirSync(vendor).find((f) => f.startsWith(prefix) && f.endsWith(".tgz"));
    return `file:${path.join(vendor, name).replaceAll("\\", "/")}`;
  };
  writeJson(path.join(app, "package.json"), {
    name: "config-axes-app",
    private: true,
    type: "module",
    dependencies: {
      ...dependencies,
      "axis-esm-lib": tarball("axis-esm-lib-"),
      "vitest-native": tarball("vitest-native-"),
    },
  });

  // The repository's release cooldown (bunfig minimumReleaseAge): stay a week behind.
  const before = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const env = {
    ...process.env,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
  };
  if (isolated) {
    fs.writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      `packages:\n  - apps/*\n  - packages/*\n# A week, in minutes: the repository's release cooldown.\nminimumReleaseAge: 10080\n`,
    );
    must(
      sh("npx", ["--yes", "pnpm@10", "install", "--no-frozen-lockfile"], root, env),
      "pnpm install",
    );
  } else {
    must(
      sh("npm", ["install", `--before=${before.toISOString()}`, "--legacy-peer-deps"], root, env),
      "npm install",
    );
  }
  return root;
}

/** Local mode: link packages from an existing node_modules instead of installing. */
function linkLocal(root, app, source) {
  const modules = path.join(root, "node_modules");
  fs.mkdirSync(path.join(modules, "@axis"), { recursive: true });
  for (const name of MEMBERS) {
    fs.symlinkSync(path.join(root, "packages", name), path.join(modules, "@axis", name));
  }
  const vitestNative = path.resolve(argument("vitest-native") ?? packageRoot);
  fs.symlinkSync(vitestNative, path.join(modules, "vitest-native"));
  // A copy, as an install makes it (see materialise).
  fs.cpSync(path.join(root, "vendor/axis-esm-lib"), path.join(modules, "axis-esm-lib"), {
    recursive: true,
  });

  const rntl = argument("rntl");
  if (rntl) {
    // Copied, not linked: RNTL resolves react from its real path, and a link would reach
    // another tree's React. Its own dependencies are linked from beside it.
    const target = path.join(modules, "@testing-library/react-native");
    fs.cpSync(rntl, target, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(rntl, "package.json"), "utf8"));
    const beside = path.resolve(rntl, "../..");
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      const from = path.join(beside, dep);
      const to = path.join(modules, dep);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.symlinkSync(fs.realpathSync(from), to);
      }
    }
  }
  for (const entry of fs.readdirSync(source)) {
    if (entry.startsWith(".")) continue;
    const scoped = entry.startsWith("@");
    for (const name of scoped
      ? fs.readdirSync(path.join(source, entry)).map((n) => `${entry}/${n}`)
      : [entry]) {
      const to = path.join(modules, name);
      if (fs.existsSync(to)) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(fs.realpathSync(path.join(source, name)), to);
    }
  }
  // Compiled package output requires Babel's helpers by name. Every real install puts
  // @babel/runtime where an installed package can resolve it (npm hoists it; pnpm and
  // bun hoist into their store's shared node_modules), and a bun workspace's package
  // directory does not, so link it from beside the preset.
  const runtime = path.join(modules, "@babel/runtime");
  if (!fs.existsSync(runtime)) {
    const preset = createRequire(
      fs.realpathSync(path.join(modules, "@react-native/babel-preset/package.json")),
    );
    fs.symlinkSync(path.dirname(preset.resolve("@babel/runtime/package.json")), runtime);
  }
}

// --- run ----------------------------------------------------------------------------

function vitestRun(app, run, files, outputFile) {
  const env = { ...process.env, CI: "1" };
  // The harness may itself run under Vitest or with loader flags; none of it may reach
  // the child.
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST") || key === "NODE_OPTIONS" || key === "NODE_PATH") delete env[key];
  }
  env.AXIS_ENGINE = run.engine;
  env.AXIS_GLOBALS = run.globals;
  env.AXIS_HOT = run.hot;
  env.AXIS_JEST_COMPAT = run.jestCompat;
  // pnpm links Vitest into the app; npm hoists it to the workspace root.
  const installed = [
    path.join(app, "node_modules/vitest"),
    path.join(app, "../../node_modules/vitest"),
  ];
  const bin = path.join(fs.realpathSync(installed.find((dir) => fs.existsSync(dir))), "vitest.mjs");
  return sh(
    process.execPath,
    [
      bin,
      "run",
      "--reporter=json",
      `--outputFile=${outputFile}`,
      ...files.map((f) => `probes/${f}`),
    ],
    app,
    env,
  );
}

/** Per-file results from Vitest's JSON report: { file: { ok, detail } }. */
function fileResults(outputFile) {
  if (!fs.existsSync(outputFile)) return null;
  const report = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  const results = {};
  for (const file of report.testResults ?? []) {
    const assertions = file.assertionResults ?? [];
    const failed = assertions.filter((a) => a.status !== "passed");
    // A file with no passing assertion proves nothing, whatever its status says.
    const ok = file.status === "passed" && assertions.length > 0 && failed.length === 0;
    const detail =
      failed
        .map((a) => `${a.title}: ${(a.failureMessages ?? []).join(" ").split("\n")[0]}`)
        .join("; ") ||
      (file.message ?? "").split("\n")[0] ||
      (assertions.length === 0 ? "no tests ran" : "");
    results[path.basename(file.name)] = { ok, detail };
  }
  return results;
}

function probeResult(probe, results, extra = "") {
  if (!results) return { status: "fail", detail: `no report: the run crashed${extra}` };
  for (const file of probe.files) {
    const result = results[file];
    if (!result) return { status: "fail", detail: `${file} did not run${extra}` };
    if (!result.ok) return { status: "fail", detail: `${file}: ${result.detail}` };
  }
  return { status: "pass" };
}

function runCell(cell, root, entries) {
  const app = path.join(root, "apps/app");
  const only = argument("only")?.split(",");
  const selected = PROBES.filter((probe) => !only || only.includes(probe.id));
  const verdicts = [];
  for (const [index, run] of cell.runs.entries()) {
    const full = { ...cell, ...run };
    delete full.runs;
    const label = Object.entries(run)
      .map(([axis, value]) => `${axis}=${value}`)
      .join(" ");
    const results = new Map();
    const active = selected.filter((probe) => applies(probe, run));
    for (const probe of selected)
      if (!active.includes(probe)) results.set(probe.id, { status: "n/a" });

    const shared = active.filter((probe) => !probe.alone && !probe.output);
    const out = path.join(root, `report-${index}-shared.json`);
    const started = Date.now();
    const sharedRun = vitestRun(
      app,
      run,
      shared.flatMap((probe) => probe.files),
      out,
    );
    const sharedResults = fileResults(out);
    for (const probe of shared) results.set(probe.id, probeResult(probe, sharedResults));
    // An exit code the per-file results do not explain (an unhandled error, a crash after
    // the report) belongs to no probe; it fails the run rather than vanishing.
    const allPassed = shared.every((probe) => results.get(probe.id).status === "pass");
    if (sharedRun.status !== 0 && allPassed) {
      results.set("(shared run)", {
        status: "fail",
        detail: `exit ${sharedRun.status}${sharedRun.timedOut ? " (timed out)" : ""} with every probe passing:\n${sharedRun.output.slice(-2000)}`,
      });
    }
    for (const probe of active.filter((p) => p.output)) {
      const problem = probe.check(sharedRun.output);
      results.set(probe.id, problem ? { status: "fail", detail: problem } : { status: "pass" });
    }
    for (const probe of active.filter((p) => p.alone)) {
      const own = path.join(root, `report-${index}-${probe.id}.json`);
      const alone = vitestRun(app, run, probe.files, own);
      const result = probeResult(probe, fileResults(own));
      results.set(
        probe.id,
        result.status === "pass" && alone.status !== 0
          ? { status: "fail", detail: `every test passed but Vitest exited ${alone.status}` }
          : result,
      );
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n${cellName(cell)} · ${label}  (${seconds}s)`);
    for (const [probe, result] of results) {
      const verdict =
        probe === "(shared run)"
          ? { probe, outcome: "ERROR", ok: false, message: result.detail }
          : judge(entries, probe, full, result);
      verdicts.push({ ...verdict, run: label });
      console.log(
        `  ${verdict.outcome.padEnd(10)} ${probe}${verdict.message ? `  — ${verdict.message}` : ""}`,
      );
    }
    if (process.env.AXIS_DEBUG) console.log(sharedRun.output);
  }
  return verdicts;
}

// --- main ---------------------------------------------------------------------------

const axes = readAxes();
const entries = readKnownFailing();
const problems = validateEntries(entries, axes, PROBES);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const cellArg = argument("cell");
if (!cellArg) {
  console.error("usage: run.mjs --cell '<json>' (see cells.mjs)");
  process.exit(2);
}
const cell = JSON.parse(cellArg);
const root = materialise(cell, axes);
let verdicts;
try {
  verdicts = runCell(cell, root, entries);
} finally {
  if (flag("keep")) console.log(`\nworkspace kept at ${root}`);
  else fs.rmSync(root, { recursive: true, force: true });
}
const bad = verdicts.filter((verdict) => !verdict.ok);
const known = verdicts.filter((verdict) => verdict.outcome === "known");
console.log(
  `\n${cellName(cell)}: ${verdicts.filter((v) => v.outcome === "pass").length} pass, ${known.length} known failures, ${bad.length} problems`,
);
if (bad.length > 0) {
  console.log("\nTo accept a failure as known, add to known-failing.json (with the fixing PR):");
  for (const verdict of bad.filter((v) => v.outcome === "REGRESSION")) {
    const run = Object.fromEntries(verdict.run.split(" ").map((pair) => pair.split("=")));
    const when = { vitest: cell.vitest, rntl: cell.rntl, layout: cell.layout, ...run };
    console.log(`  ${JSON.stringify({ probe: verdict.probe, when, fixedBy: "#?", why: "?" })}`);
  }
  process.exit(1);
}

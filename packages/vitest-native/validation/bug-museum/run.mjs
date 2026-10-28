// The bug museum's runner (README.md): runs every exhibit, or a filter, against a built
// vitest-native and reports each as PASS, FAIL (with its failure signature) or N/A (why).
//
//   node validation/bug-museum/run.mjs [--only id,id] [--class ownership,...]
//        [--build <vitest-native package dir>] [--json <file>] [--work <dir>] [--keep]
//
//   --build   the package under test (default: this package). It must be built; its
//             package.json + dist are copied into each exhibit's node_modules.
//   --json    write the verdicts as JSON (status.mjs renders STATUS.md from them); each
//             verdict records the build's git SHA (lib/build-info.mjs)
//   --allow-na exit 0 even when an exhibit is N/A (by default N/A exits 1: an exhibit
//             that could not run is not evidence)
//   --work    where exhibits are materialised (default: a fresh directory in os.tmpdir())
//   --control run each exhibit's control instead (exhibits.json `control`: edits that
//             remove the bug's precondition). A control must PASS on any build: it shows
//             the exhibit can pass, which is the only evidence for exhibits whose fix does
//             not exist yet.
//
// Every exhibit asserts the CORRECT behaviour, so it PASSes only on a build without the
// bug. A run PASSes only when all three witnesses agree (lib/accounting.mjs): the process
// exited 0, every expected test file reported passing tests, and the accounting reporter
// saw no unhandled error and no lost file (the config-axis matrix's accounting). A FAIL is
// "the bug" only when EVERY failure line is the exhibit's `bugSignature` or one of its
// `consequences` (lib/verdict.mjs, judged by the matrix's verdict.mjs); any other FAIL is
// "unexpected", which on a buggy build means the exhibit no longer reaches its bug.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInfo } from "./lib/build-info.mjs";
import { exhibitHash } from "./lib/hash.mjs";
import { runLines } from "./lib/lines.mjs";
import { findRntl, materialise, museumRoot, packageRoot } from "./lib/materialise.mjs";
import { classify, validateSignature } from "./lib/verdict.mjs";
import { prepareVitest4 } from "./lib/vitest4.mjs";

const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

export const CLASSES = [
  "ownership",
  "env-contract",
  "per-file-state",
  "presets",
  "transform/resolution",
  "harness",
  "config",
];

export function readExhibits() {
  const manifest = JSON.parse(fs.readFileSync(path.join(museumRoot, "exhibits.json"), "utf8"));
  const problems = [];
  const ids = new Set();
  for (const exhibit of manifest.exhibits) {
    if (ids.has(exhibit.id)) problems.push(`${exhibit.id}: duplicate id`);
    ids.add(exhibit.id);
    if (!CLASSES.includes(exhibit.class))
      problems.push(`${exhibit.id}: unknown class ${exhibit.class}`);
    const dir = path.join(museumRoot, "exhibits", exhibit.id);
    if (!fs.existsSync(dir)) problems.push(`${exhibit.id}: no directory exhibits/${exhibit.id}`);
    else if (!fs.existsSync(path.join(dir, "README.md")))
      problems.push(`${exhibit.id}: no README.md`);
  }
  for (const exhibit of manifest.exhibits) {
    const dir = path.join(museumRoot, "exhibits", exhibit.id);
    if (fs.existsSync(dir)) problems.push(...validateSignature(exhibit, testFiles(dir)));
  }
  for (const dir of fs.readdirSync(path.join(museumRoot, "exhibits")))
    if (!ids.has(dir)) problems.push(`exhibits/${dir}: not in exhibits.json`);
  if (problems.length > 0) throw new Error(`exhibits.json:\n${problems.join("\n")}`);
  return manifest.exhibits;
}

/** The test files of an exhibit (basenames, which must be unique within it). */
function testFiles(dir) {
  const found = [];
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      // fixture/: an inner project an exhibit's test runs itself
      if (["node_modules", "vendor", "packages", "fixture"].includes(entry.name)) continue;
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) found.push(entry.name);
    }
  };
  walk(dir);
  return found.sort();
}

function childEnv(exhibit, accountingFile) {
  const env = { ...process.env, CI: "1" };
  // The runner may itself run under Vitest or with loader flags; none of it reaches the child.
  for (const key of Object.keys(env))
    if (key.startsWith("VITEST") || key === "NODE_OPTIONS" || key === "NODE_PATH") delete env[key];
  return { ...env, ...exhibit.env, AXIS_ACCOUNTING_FILE: accountingFile };
}

/** Why the exhibit cannot run here, or null. */
function notApplicable(exhibit, context) {
  const requires = exhibit.requires ?? {};
  if (exhibit.na) return exhibit.na;
  if (requires.rntl && !findRntl(requires.rntl))
    return `requires-CI: no local RNTL ${requires.rntl} store (set VN_MUSEUM_RNTL_STORE)`;
  if (requires.vitest === "4" && !context.vitest4)
    return `requires-CI: Vitest 4 unavailable (${context.vitest4Reason})`;
  return null;
}

function runExhibit(original, context) {
  // A control may also change the install axes (`control.requires`, e.g. another RNTL).
  const exhibit =
    context.control && original.control?.requires
      ? { ...original, requires: original.control.requires }
      : original;
  const na = notApplicable(exhibit, context);
  if (na) return { verdict: "N/A", reason: na };
  if (context.control && !exhibit.control) return { verdict: "N/A", reason: "no control defined" };
  // The control removes the bug's precondition (exhibits.json `control`): a passing
  // control shows the exhibit CAN pass, so its failure elsewhere is the bug's.
  const root = materialise(exhibit, {
    ...context,
    edits: context.control ? (exhibit.control.edits ?? []) : [],
  });
  const vitestBin = path.join(
    fs.realpathSync(path.join(root, "node_modules/vitest")),
    "vitest.mjs",
  );
  const expected = testFiles(path.join(museumRoot, "exhibits", exhibit.id));
  // Most exhibits are one Vitest run. `runs` lists several (each its own args and the
  // test files it is given): every one must pass, and check.mjs sees the tree after all.
  const runs = exhibit.runs ?? [{ args: [], files: expected }];
  const started = Date.now();
  const failures = [];
  let output = "";
  for (const [index, run] of runs.entries()) {
    const reportFile = path.join(root, `.museum-report-${index}.json`);
    const accountingFile = path.join(root, `.museum-accounting-${index}.json`);
    const proc = spawnSync(
      process.execPath,
      [
        vitestBin,
        "run",
        "--reporter=json",
        `--reporter=${path.join(museumRoot, "../config-axes/fixture/apps/app/accounting-reporter.mjs")}`,
        `--outputFile.json=${reportFile}`,
        // MUSEUM_DEBUG=1 also prints Vitest's own report (and the tests' console output)
        ...(process.env.MUSEUM_DEBUG ? ["--reporter=default"] : []),
        ...(exhibit.args ?? []),
        ...(run.args ?? []),
        // a run given a subset of the files names them as filters
        ...(exhibit.runs && run.files ? run.files : []),
      ],
      {
        cwd: root,
        env: { ...childEnv(exhibit, accountingFile), ...run.env },
        encoding: "utf8",
        timeout: exhibit.timeoutMs ?? 180_000,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const result = {
      status: proc.status,
      signal: proc.signal,
      timedOut: proc.error?.code === "ETIMEDOUT",
    };
    output += `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
    const files = run.files ?? expected;
    const prefix = runs.length > 1 ? `run ${index + 1}: ` : "";
    failures.push(
      ...runLines(result, files, reportFile, accountingFile).map((line) => prefix + line),
    );
  }
  const seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  const checkFile = path.join(root, "check.mjs");
  if (fs.existsSync(checkFile)) {
    // check.mjs gets the combined output on stdin and the exhibit root as its argument;
    // it exits non-zero with the failure on stdout.
    const check = spawnSync(process.execPath, [checkFile, root], {
      input: output,
      encoding: "utf8",
      cwd: root,
    });
    if (check.status !== 0) failures.push(`check.mjs: ${(check.stdout + check.stderr).trim()}`);
  }
  if (!context.keep) fs.rmSync(root, { recursive: true, force: true });
  const debug = process.env.MUSEUM_DEBUG ? { output: output.slice(-4000) } : {};
  if (failures.length === 0) return { verdict: "PASS", seconds, ...debug };
  const { matchesBug, why } = classify(exhibit, expected, failures);
  return {
    verdict: "FAIL",
    seconds,
    failures: failures.map((line) => line.slice(0, 500)),
    matchesBug,
    ...(why ? { why: why.slice(0, 1000) } : {}),
    ...debug,
  };
}

function main() {
  const exhibits = readExhibits();
  const only = argument("only")?.split(",");
  const classes = argument("class")?.split(",");
  const selected = exhibits.filter(
    (e) => (!only || only.includes(e.id)) && (!classes || classes.includes(e.class)),
  );
  if (only)
    for (const id of only)
      if (!exhibits.some((e) => e.id === id)) throw new Error(`no exhibit ${id}`);
  const build = path.resolve(argument("build") ?? packageRoot);
  const provenance = buildInfo(build);
  const work = argument("work")
    ? path.resolve(argument("work"))
    : fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-bug-museum-")));
  fs.mkdirSync(work, { recursive: true });
  const context = {
    work: fs.realpathSync(work),
    build,
    keep: flag("keep"),
    control: flag("control"),
  };
  if (selected.some((e) => e.requires?.vitest === "4")) {
    const prepared = prepareVitest4(path.join(context.work, ".vitest4"));
    context.vitest4 = prepared.dir;
    context.vitest4Reason = prepared.reason;
  }

  const verdicts = {};
  for (const exhibit of selected) {
    let verdict;
    try {
      verdict = runExhibit(exhibit, context);
    } catch (error) {
      verdict = {
        verdict: "FAIL",
        failures: [`the runner could not build the exhibit: ${error.message}`],
        matchesBug: false,
      };
    }
    verdicts[exhibit.id] = {
      ...verdict,
      build: provenance,
      exhibit: exhibitHash(museumRoot, exhibit),
    };
    const tag =
      verdict.verdict === "FAIL"
        ? verdict.matchesBug
          ? "FAIL (the bug)"
          : "FAIL (unexpected)"
        : verdict.verdict;
    const detail =
      verdict.verdict === "N/A"
        ? verdict.reason
        : verdict.verdict === "FAIL"
          ? verdict.failures[0]
          : "";
    console.log(`${tag.padEnd(18)} ${exhibit.id.padEnd(40)} ${verdict.seconds ?? "-"}s  ${detail}`);
    if (process.env.MUSEUM_DEBUG && verdict.output) console.log(verdict.output);
  }
  const count = (v) => Object.values(verdicts).filter((x) => x.verdict === v).length;
  console.log(
    `\n${count("PASS")} pass, ${count("FAIL")} fail, ${count("N/A")} n/a (build: ${build}, ${provenance.sha}${provenance.ref ? ` = ${provenance.ref}` : ""})`,
  );
  if (argument("json")) {
    const out = path.resolve(argument("json"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const previous = fs.existsSync(out)
      ? JSON.parse(fs.readFileSync(out, "utf8"))
      : { verdicts: {} };
    // A filtered run updates its exhibits and keeps the others' earlier verdicts.
    const merged = { verdicts: { ...previous.verdicts, ...verdicts } };
    fs.writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
  }
  if (!argument("work") && !context.keep) fs.rmSync(work, { recursive: true, force: true });
  // N/A is not a pass: an exhibit that could not run (a missing local copy, a hand-set
  // `na`) proves nothing, so it fails the run unless the caller says it may.
  const na = count("N/A") > 0 && !flag("allow-na");
  if (na) console.log(`${count("N/A")} exhibit(s) N/A: exiting 1 (pass --allow-na to accept)`);
  process.exitCode = count("FAIL") > 0 || na ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

// Records measured verdicts into exhibits.json (`status`) and renders STATUS.md.
//
//   node validation/bug-museum/status.mjs --results <dir>
//
// <dir> holds what run-columns.mjs wrote: main.json, control.json, fix.json, buggy.json
// and preFix.json. Every verdict carries the SHA of the build it ran against
// (lib/build-info.mjs); each must be the SHA columns.json records for its column (main and
// control: the main ref; fix, buggy, preFix: the exhibit's ref). Any mismatch, unverified
// build, or missing verdict is reported and NOTHING is written: both files are rendered
// first and replaced together, or neither is.
//
// An exhibit is LOAD-BEARING when a build with the bug fails it AS the bug (every failure
// line accounted for, lib/verdict.mjs) and a build without the bug passes it:
//   fix proven     main FAIL (bug) or buggyRef FAIL (bug), and fixRef PASS
//   guard proven   main PASS, buggyRef FAIL (bug)   (a regression a fix PR introduced)
//   landed proven  preFixRef FAIL (bug), main PASS  (a fix already on main)
//   open           main FAIL (bug), control PASS    (no fix yet; the control removes the
//                  bug's precondition and shows the exhibit can pass)
// Anything else is reported as what it is (requires-CI, NOT PROVEN), never rounded up.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exhibitHash } from "./lib/hash.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const resultsDir = argument("results");
if (!resultsDir) throw new Error("--results <dir> is required");
const readColumn = (name) => {
  const file = path.join(resultsDir, `${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).verdicts : {};
};
const columns = {
  main: readColumn("main"),
  control: readColumn("control"),
  fix: readColumn("fix"),
  buggy: readColumn("buggy"),
  preFix: readColumn("preFix"),
};
const shas = JSON.parse(fs.readFileSync(path.join(here, "columns.json"), "utf8"));
const manifestFile = path.join(here, "exhibits.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

const problems = [];
const expectedSha = (exhibit, column) => {
  if (column === "main" || column === "control") return shas.main.sha;
  const ref = exhibit[{ fix: "fixRef", buggy: "buggyRef", preFix: "preFixRef" }[column]];
  return shas.refs[ref];
};

/** "PASS" | "FAIL (bug)" | "FAIL (other)" | "N/A" */
function cell(verdict) {
  if (verdict.verdict === "FAIL") return verdict.matchesBug ? "FAIL (bug)" : "FAIL (other)";
  return verdict.verdict;
}

// Absolute paths in failure lines are machine-specific: keep the message, not the path.
const scrub = (line) =>
  line
    .replace(
      /\/(?:private\/)?(?:tmp|var)\/\S*?\/(?:work|vn-bug-museum-[^/\s]+)\/[^/\s]+\//g,
      "<exhibit>/",
    )
    .replace(/\/Users\/[^/\s]+\//g, "~/")
    .slice(0, 240);

function proof(exhibit, s) {
  if (s.main === "PASS" && s.buggy === "FAIL (bug)") return "guard proven";
  const bugShown = s.main === "FAIL (bug)" || s.buggy === "FAIL (bug)";
  if (bugShown && s.fix === "PASS")
    return s.main === "FAIL (bug)" ? "fix proven" : "fix proven (bug on buggyRef)";
  if (s.main === "PASS" && s.preFix === "FAIL (bug)") return "landed proven";
  if (s.main === "FAIL (bug)" && s.control === "PASS") return "open (control passes)";
  if (s.main === "FAIL (bug)" && exhibit.fixVerification)
    return "bug shown; passing side requires-CI";
  if (s.main === "N/A") return "requires-CI";
  return "NOT PROVEN";
}

for (const exhibit of manifest.exhibits) {
  const status = {};
  for (const [column, verdicts] of Object.entries(columns)) {
    const wanted =
      column === "main" ||
      (column === "control" && exhibit.control) ||
      (column === "fix" && exhibit.fixRef) ||
      (column === "buggy" && exhibit.buggyRef) ||
      (column === "preFix" && exhibit.preFixRef);
    if (!wanted) continue;
    const verdict = verdicts[exhibit.id];
    if (!verdict) {
      problems.push(`${exhibit.id}: no ${column} verdict in ${resultsDir}/${column}.json`);
      continue;
    }
    const sha = expectedSha(exhibit, column);
    if (!verdict.build?.verified)
      problems.push(
        `${exhibit.id}: the ${column} verdict ran on an unverified build (${verdict.build?.sha ?? "no SHA"}); build it with build-ref.mjs`,
      );
    else if (verdict.build.sha !== sha)
      problems.push(
        `${exhibit.id}: the ${column} verdict ran on ${verdict.build.sha}, but columns.json says ${sha ?? "(no entry)"}`,
      );
    if (verdict.exhibit !== exhibitHash(here, exhibit))
      problems.push(
        `${exhibit.id}: the ${column} verdict was measured on ${verdict.exhibit ? "an earlier version of" : "an unrecorded version of"} this exhibit; run it again`,
      );
    status[column] = cell(verdict);
  }
  status.measuredOn = columns.main[exhibit.id]?.build?.sha;
  const main = columns.main[exhibit.id];
  if (main?.verdict === "FAIL") status.mainSignature = scrub(main.failures[0]);
  if (main?.verdict === "N/A") status.mainReason = main.reason;
  status.proof = proof(exhibit, status);
  exhibit.status = status;
}
if (problems.length > 0) {
  console.error(`status.mjs: nothing written:\n${problems.join("\n")}`);
  process.exit(1);
}

// --- STATUS.md --------------------------------------------------------------------
const CLASSES = [
  "ownership",
  "env-contract",
  "per-file-state",
  "presets",
  "transform/resolution",
  "harness",
  "config",
];
const rows = manifest.exhibits;
const count = (pred) => rows.filter(pred).length;
const short = (ref) => ref.replace(/^origin\//, "");
const withFix = (e) => {
  const s = e.status;
  const parts = [];
  if (s.buggy) parts.push(`bug build: ${s.buggy} on ${short(e.buggyRef)}`);
  if (s.fix) parts.push(`${s.fix} (${short(e.fixRef)})`);
  if (s.preFix) parts.push(`before the fix: ${s.preFix} (${e.preFixRef})`);
  return parts.join("; ") || "-";
};
const proven = (e) => /^(fix proven|guard proven|landed proven)/.test(e.status.proof);
const lines = [
  "# Bug museum status",
  "",
  `Measured on origin/main \`${shas.main.sha.slice(0, 7)}\` (Node ${process.version.slice(1)}; Vitest 5.0.5 unless an exhibit needs 4.1.11; RNTL 14.1 unless it needs 12/13). Every verdict below ran on the build whose SHA columns.json records for its column. Generated by \`status.mjs\` from \`run-columns.mjs\` output.`,
  "",
  `- **${rows.length} exhibits.** ${count((e) => e.status.main?.startsWith("FAIL"))} fail on main today (${count((e) => e.status.main === "FAIL (bug)")} as their bug, ${count((e) => e.status.main === "FAIL (other)")} some other way); ${count((e) => e.status.main === "PASS")} pass on main.`,
  `- **Proof:** ${count(proven)} proven against a build without the bug (fix, guard or landed); ${count((e) => e.status.proof.startsWith("open"))} open bugs fail on main as their bug and pass their control; ${count((e) => e.status.proof.includes("requires-CI"))} ${count((e) => e.status.proof.includes("requires-CI")) === 1 ? "shows its bug but needs" : "show their bug but need"} CI for the passing side; ${count((e) => e.status.proof === "NOT PROVEN")} not proven.`,
  "",
  "Columns: **main** is origin/main. **With fix** is the exhibit against the build of its fix branch (`fixRef`), and where recorded the build that has the bug (`buggyRef`: a regression a fix PR introduced, or the pre-fix state of a bug main cannot reach) or the build before a landed fix (`preFixRef`). **Control** is `run.mjs --control` on main: the exhibit with its bug's precondition removed, which must pass. `FAIL (bug)`: every failure line is the exhibit's signature or a consequence of it. `FAIL (other)`: some line is not.",
  "",
  "| Exhibit | Class | Fixed by | main | With fix | Control | Proof |",
  "|---|---|---|---|---|---|---|",
  ...CLASSES.flatMap((cls) =>
    rows
      .filter((e) => e.class === cls)
      .map(
        (e) =>
          `| [${e.id}](exhibits/${e.id}/README.md) | ${e.class} | ${e.fixedBy} | ${e.status.main ?? "-"} | ${withFix(e)} | ${e.status.control ?? "-"} | ${e.status.proof} |`,
      ),
  ),
  "",
  "## By class",
  "",
  "| Class | Exhibits | Fail on main | Open |",
  "|---|---|---|---|",
  ...CLASSES.map((cls) => {
    const of = rows.filter((e) => e.class === cls);
    return `| ${cls} | ${of.length} | ${of.filter((e) => e.status.main?.startsWith("FAIL")).length} | ${of.filter((e) => e.status.proof.startsWith("open")).length} |`;
  }),
  "",
  "## Failure on main, per exhibit",
  "",
  ...rows
    .filter((e) => e.status.mainSignature)
    .map(
      (e) => `- \`${e.id}\` (${e.status.main}): ${e.status.mainSignature.replaceAll("|", "\\|")}`,
    ),
  "",
];
const notes = rows.filter((e) => e.fixVerification);
if (notes.length > 0) {
  lines.push("## Not verifiable locally", "");
  for (const e of notes) lines.push(`- \`${e.id}\`: ${e.fixVerification}`);
  lines.push("");
}

// Both files or neither: write beside them, then rename.
const outputs = [
  [manifestFile, `${JSON.stringify(manifest, null, 2)}\n`],
  [path.join(here, "STATUS.md"), lines.join("\n")],
];
for (const [file, text] of outputs) fs.writeFileSync(`${file}.tmp`, text);
for (const [file] of outputs) fs.renameSync(`${file}.tmp`, file);
console.log(`wrote STATUS.md and the status of ${rows.length} exhibits`);

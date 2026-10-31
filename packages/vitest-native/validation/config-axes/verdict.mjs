// How a probe's result in one run becomes a verdict, against known-failing.json.
//
// known-failing.json lists the probes that fail TODAY on some cells, each with the axis
// values it fails on and the pull request that fixes it:
//
//   { "probe": "rntl-auto-cleanup", "when": { "globals": "off" },
//     "failure": "the previous test's tree was unmounted: .*expected \\+0 to be 1",
//     "fixedBy": "#342" }
//
// `when` maps axes to a value or a list of values; an entry with no `when` matches every
// run. A probe's result carries one line per failure: a failed assertion (with its cause
// chain), a file that did not run, and for a probe run alone its process's run-level
// problems (accounting.mjs).
//
//   failure       a regex for the failure the entry expects: the bug itself. It may not
//                 match a generic line (genericFailureLines: a crash, a lost file, an
//                 unrelated error, Vitest's bare "error when mocking a module").
//   consequences  optional: a regex for lines the bug causes but that do not identify it
//                 (a file the run lost after the bug threw, an exit code). Accepted only
//                 when the entry's own `failure` matched a line in the same run, so a lost
//                 file with no bug beside it is still a regression. It may match only
//                 lost-file and exit-code lines (consequenceShapedLines), and it cannot
//                 account for every file of the probe being lost.
//
// Verdicts, per run:
//
//   pass, no entry applies        pass
//   fail, every line accounted    known: each line matches the failure or consequences
//                                 of an applying entry whose failure matched, and every
//                                 applying entry's failure matched some line
//   fail, a line unaccounted      REGRESSION: not listed, or failing some other way
//   an applying entry unmatched   STALE: its bug no longer shows here (the probe passes,
//                                 or fails only for another entry's reason), so the entry
//                                 must be deleted. Judged per entry, so two entries on one
//                                 probe cannot hide a fixed bug and absorb its regression.
//   n/a                           the probe cannot run here (probes.mjs `requires`)
//
// A pass where the probe runs but cannot observe its defect (probes.mjs `observes`) is
// reported by run.mjs as "unobserved": not evidence, though a failure there is judged here
// like any other.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function readKnownFailing() {
  return JSON.parse(fs.readFileSync(path.join(here, "known-failing.json"), "utf8")).entries;
}

const asList = (value) => (Array.isArray(value) ? value : [value]);

/** The entries that expect `probe` to fail in `run` (a full assignment of every axis). */
export function matchingEntries(entries, probe, run) {
  return entries.filter(
    (entry) =>
      entry.probe === probe &&
      Object.entries(entry.when ?? {}).every(([axis, value]) => asList(value).includes(run[axis])),
  );
}

const MOCKING_FAILED =
  '[vitest] There was an error when mocking a module. If you are using "vi.mock" factory, make sure there are no top level variables inside, since this call is hoisted to top of the file. Read more: https://vitest.dev/api/vi.html#vi-mock';

/**
 * Failure lines that no signature may match, for one probe: what a crash, a lost file or
 * an unrelated error look like in that probe's own files and runs. A signature matching
 * one would absorb exactly the failures it exists to tell apart from the known bug.
 */
export function genericFailureLines(probe) {
  return [...consequenceShapedLines(probe), ...errorLines(probe)];
}

// A suite that runs Vitest more than once prefixes each run's lines with `run N: `
// (the bug museum's multi-run exhibits), so a generic line is generic under any prefix: a
// pattern anchored on `^run 2: ` must not slip past the check.
const withRunPrefixes = (lines) => [
  ...lines,
  ...lines.flatMap((line) => [1, 2, 9].map((n) => `run ${n}: ${line}`)),
];

/**
 * The generic lines a bug may legitimately cause without identifying itself: a file the
 * run lost, and an exit code the results do not explain. Only these may an entry's
 * `consequences` match.
 */
export function consequenceShapedLines(probe) {
  const lines = [
    "the JSON report says success: true, but Vitest exited 1",
    "Vitest exited 1, but no file failed and no error was unhandled",
  ];
  for (const file of probe?.files ?? []) {
    lines.push(
      `${file}: did not run`,
      `${file}: no tests ran`,
      `file accounting: no result in the JSON report for ${file}`,
      `file accounting: Vitest never reported module ${file}`,
      `file accounting: unfinished module ${file} (queued)`,
    );
  }
  return withRunPrefixes(lines);
}

/** Crashes, assertions and errors: generic lines that neither field may match. */
export function errorLines(probe) {
  const lines = [
    "",
    // Both crash wordings: run.mjs's, and accounting.mjs's runProblems.
    "no report: the run crashed",
    "no JSON report: the run crashed",
    "no accounting record: the run ended before Vitest's onTestRunEnd",
    "file accounting: the JSON report has unrequested other.test.ts",
    "Vitest exited 0 with 1 failed files and 0 unhandled errors",
    "the JSON report says success: false, but Vitest exited 0",
    "the process was killed by SIGSEGV",
    "the process exited 134 (Vitest exits 0 or 1)",
    "the run timed out",
    "unhandled error: Error: something unrelated",
    "unhandled error: VitestNativeError: [vitest-native] hotRuntime state restoration failed: / - some.other restore: boom",
  ];
  for (const file of probe?.files ?? []) {
    lines.push(
      `${file}: Error: Worker exited unexpectedly`,
      `${file}: Cannot find module 'something-else'`,
      `${file}: ${MOCKING_FAILED}`,
      `${file}: ${MOCKING_FAILED} (caused by: TypeError: mutant)`,
      `${file}: a test: TypeError: Cannot read properties of undefined (reading 'x')`,
      `${file}: a test: AssertionError: expected 1 to be 2 // Object.is equality`,
      `unhandled error (from ${file}): Error: something unrelated`,
    );
  }
  return withRunPrefixes(lines);
}

const failuresOf = (result) =>
  result.failures?.length > 0 ? result.failures : [result.detail ?? ""];

const describeEntry = (entry) => `/${entry.failure}/ (${entry.fixedBy})`;

/**
 * The verdict for one probe in one run. `result` is { status: 'pass'|'fail'|'n/a',
 * failures?, files? } (`files`: the probe's test files, for the lost-file rule).
 * Returns { probe, outcome, ok, message }.
 */
export function judge(entries, probe, run, result) {
  if (result.status === "n/a") return { probe, outcome: "n/a", ok: true, message: "" };
  const listed = matchingEntries(entries, probe, run);
  if (result.status === "pass") {
    if (listed.length === 0) return { probe, outcome: "pass", ok: true, message: "" };
    return {
      probe,
      outcome: "STALE",
      ok: false,
      message: `passes, but known-failing.json expects ${listed.map(describeEntry).join(", ")} here. Delete the entry.`,
    };
  }
  const failures = failuresOf(result);
  if (listed.length === 0) {
    return {
      probe,
      outcome: "REGRESSION",
      ok: false,
      message: `fails and is not in known-failing.json: ${failures.join("; ") || "(no detail)"}`,
    };
  }
  const signature = (entry) => new RegExp(entry.failure);
  const shown = listed.filter((entry) => failures.some((line) => signature(entry).test(line)));
  const accounted = (line) =>
    shown.some(
      (entry) =>
        signature(entry).test(line) ||
        (entry.consequences !== undefined && new RegExp(entry.consequences).test(line)),
    );
  // A lost file is a consequence only while some file of the probe ran: the bug must
  // have run to throw. Every file lost is a crash, whatever the entry says.
  const lost = (result.files ?? []).filter((file) =>
    failures.some(
      (line) => line.includes(file) && !shown.some((entry) => signature(entry).test(line)),
    ),
  );
  if (result.files?.length > 0 && lost.length === result.files.length) {
    return {
      probe,
      outcome: "REGRESSION",
      ok: false,
      message: `fails, and every file of the probe was lost: ${failures.join("; ")}`,
    };
  }
  const unexpected = failures.filter((line) => !accounted(line));
  if (unexpected.length > 0) {
    return {
      probe,
      outcome: "REGRESSION",
      ok: false,
      message: `fails, but not as known-failing.json expects ${listed.map(describeEntry).join(", ")}: ${unexpected.join("; ")}`,
    };
  }
  const stale = listed.filter((entry) => !shown.includes(entry));
  if (stale.length > 0) {
    return {
      probe,
      outcome: "STALE",
      ok: false,
      message: `fails, but not with ${stale.map(describeEntry).join(", ")}: that bug no longer shows here. Delete the entry.`,
    };
  }
  const fixes = [...new Set(shown.map((entry) => entry.fixedBy))].join(", ");
  return { probe, outcome: "known", ok: true, message: `fails as listed, fixed by ${fixes}` };
}

/**
 * Structural checks on the list itself, against the axes and the probe catalog, so a
 * typo cannot make an entry match nothing (an entry that matches nothing can never go
 * stale, which is how a list rots).
 */
export function validateEntries(entries, axes, probes) {
  const problems = [];
  const values = { ...axes.install, ...axes.runtime };
  const ids = new Set(probes.map((probe) => probe.id));
  for (const [index, entry] of entries.entries()) {
    const at = `known-failing.json entry ${index} (${entry.probe})`;
    if (!ids.has(entry.probe)) problems.push(`${at}: no probe has this id`);
    if (!/^#\d+$/.test(entry.fixedBy ?? "")) problems.push(`${at}: fixedBy must be "#<pr>"`);
    if (!entry.why) problems.push(`${at}: say why it fails (\`why\`)`);
    if (typeof entry.failure !== "string" || entry.failure === "") {
      problems.push(`${at}: give the expected failure's signature (\`failure\`, a regex)`);
    } else {
      let signature = null;
      try {
        signature = new RegExp(entry.failure);
      } catch (error) {
        problems.push(`${at}: \`failure\` is not a regular expression: ${error.message}`);
      }
      const probe = probes.find((p) => p.id === entry.probe);
      const absorbs = signature
        ? genericFailureLines(probe).filter((line) => signature.test(line))
        : [];
      if (absorbs.length > 0)
        problems.push(
          `${at}: \`failure\` also matches ${absorbs.map((l) => JSON.stringify(l)).join(", ")}, so it would absorb other failures`,
        );
    }
    if (entry.consequences !== undefined) {
      let consequences = null;
      try {
        consequences = new RegExp(entry.consequences);
      } catch (error) {
        problems.push(`${at}: \`consequences\` is not a regular expression: ${error.message}`);
      }
      // Only a lost file or an unexplained exit code: a pattern that matched an assertion,
      // a TypeError or an unhandled error would absorb a second failure beside the bug.
      const probe = probes.find((p) => p.id === entry.probe);
      const absorbs = consequences
        ? errorLines(probe).filter((line) => consequences.test(line))
        : [];
      if (absorbs.length > 0)
        problems.push(
          `${at}: \`consequences\` also matches ${absorbs.map((l) => JSON.stringify(l)).join(", ")}; it may match only lost files and exit codes`,
        );
    }
    for (const [axis, value] of Object.entries(entry.when ?? {})) {
      if (!(axis in values)) {
        problems.push(`${at}: unknown axis "${axis}"`);
        continue;
      }
      for (const v of asList(value)) {
        if (!values[axis].includes(v)) problems.push(`${at}: ${axis} has no value "${v}"`);
      }
    }
  }
  return problems;
}

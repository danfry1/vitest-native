// How a probe's result in one run becomes a verdict, against known-failing.json.
//
// known-failing.json lists the probes that fail TODAY on some cells, each with the axis
// values it fails on and the pull request that fixes it:
//
//   { "probe": "rntl-auto-cleanup", "when": { "globals": "off" },
//     "failure": "the previous test's tree was unmounted: .*expected 0 to be 1",
//     "fixedBy": "#342" }
//
// `when` maps axes to a value or a list of values; an entry with no `when` matches every
// run. `failure` is a regular expression for the failure the entry expects: a probe's
// result carries one line per failure (a failed assertion, a file that did not run, and
// for a probe run alone its process's run-level problems), and EVERY line must match the
// signature of an entry that matches the run. Otherwise the probe failed some other way
// (a crash, a TypeError, a lost file) and that is a regression, not the known bug. The
// list may only shrink:
//
//   pass, not listed   ok
//   fail, listed       known, when every failure line matches a listed signature:
//                      reported with its fixing pull request, the cell stays green
//   fail, otherwise    REGRESSION: the cell goes red (not listed here, or failing in a
//                      way the entry does not describe)
//   pass, listed       STALE: the cell goes red, so an entry cannot outlive its fix —
//                      the fixing pull request has to delete it
//   n/a                the probe cannot observe its defect in this run (probes.mjs)
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

/**
 * The verdict for one probe in one run. `result` is { status: 'pass'|'fail'|'n/a',
 * detail? }. Returns { probe, outcome, ok, message }.
 */
/**
 * Failure lines that no signature may match: what a crash, a lost file or an unrelated
 * error look like. A signature matching one of them would absorb exactly the failures it
 * exists to tell apart from the known bug.
 */
export const NOT_A_SIGNATURE = [
  "",
  "no report: the run crashed",
  "the process was killed by SIGSEGV",
  "the process exited 134 (Vitest exits 0 or 1)",
  "the run timed out",
  "x.test.ts: did not run",
  "x.test.ts: a test: TypeError: Cannot read properties of undefined (reading 'x')",
  "x.test.ts: Error: Worker exited unexpectedly",
];

const failuresOf = (result) =>
  result.failures?.length > 0 ? result.failures : [result.detail ?? ""];

export function judge(entries, probe, run, result) {
  if (result.status === "n/a") return { probe, outcome: "n/a", ok: true, message: "" };
  const listed = matchingEntries(entries, probe, run);
  const fixes = [...new Set(listed.map((entry) => entry.fixedBy))].join(", ");
  if (result.status === "pass") {
    return listed.length === 0
      ? { probe, outcome: "pass", ok: true, message: "" }
      : {
          probe,
          outcome: "STALE",
          ok: false,
          message: `passes, but known-failing.json expects it to fail here (${fixes}). Delete the entry, or narrow its \`when\`.`,
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
  const unexpected = failures.filter(
    (line) => !listed.some((entry) => new RegExp(entry.failure).test(line)),
  );
  if (unexpected.length > 0) {
    const expects = listed.map((entry) => `/${entry.failure}/ (${entry.fixedBy})`).join(", ");
    return {
      probe,
      outcome: "REGRESSION",
      ok: false,
      message: `fails, but not as known-failing.json expects ${expects}: ${unexpected.join("; ")}`,
    };
  }
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
      const absorbs = signature ? NOT_A_SIGNATURE.filter((line) => signature.test(line)) : [];
      if (absorbs.length > 0)
        problems.push(
          `${at}: \`failure\` also matches ${absorbs.map((l) => JSON.stringify(l)).join(", ")}, so it would absorb other failures`,
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

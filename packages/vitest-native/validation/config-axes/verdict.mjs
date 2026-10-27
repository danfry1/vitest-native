// How a probe's result in one run becomes a verdict, against known-failing.json.
//
// known-failing.json lists the probes that fail TODAY on some cells, each with the axis
// values it fails on and the pull request that fixes it:
//
//   { "probe": "rntl-auto-cleanup", "when": { "globals": "off" }, "fixedBy": "#342" }
//
// `when` maps axes to a value or a list of values; an entry with no `when` matches every
// run. The list may only shrink:
//
//   pass, not listed   ok
//   fail, listed       known: reported with its fixing pull request, the cell stays green
//   fail, not listed   REGRESSION: the cell goes red
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
  return listed.length > 0
    ? { probe, outcome: "known", ok: true, message: `fails as listed, fixed by ${fixes}` }
    : {
        probe,
        outcome: "REGRESSION",
        ok: false,
        message: `fails and is not in known-failing.json: ${result.detail ?? "(no detail)"}`,
      };
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

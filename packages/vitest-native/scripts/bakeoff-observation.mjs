export function classifyObservation(got, baseline) {
  if (!baseline) return "NEW";
  if (got.total !== baseline.total || got.passed < baseline.passed) return "CHANGED";
  if (got.passed > baseline.passed) return "IMPROVED";
  return "OK";
}

/**
 * How a CHANGED observation changed: "passes-fell" when fewer tests passed than the
 * baseline, else "total-only" (test discovery found a different number of tests, and
 * no pass count fell). Undefined for any other status.
 */
export function changeKind(got, baseline) {
  if (classifyObservation(got, baseline) !== "CHANGED") return undefined;
  return got.passed < baseline.passed ? "passes-fell" : "total-only";
}

/**
 * The closing line's reason for a run that found CHANGED observations, from the
 * change kinds of those observations.
 */
export function changedReason(kinds) {
  if (kinds.includes("passes-fell")) {
    return "an external-app observation passed fewer tests than its baseline; inspect package behavior, app setup, and shims before drawing a conclusion";
  }
  return (
    "an external-app observation's test total changed and no pass count fell; " +
    "confirm the new total is expected, then record it by editing bakeoffs-ratchet.json by hand " +
    "(--update does not re-base after a change)"
  );
}

export function classifyObservationVerdict({ changed, infra }) {
  if (changed && infra) return "mixed";
  if (changed) return "changed";
  if (infra) return "infra";
  return "ok";
}

/**
 * Per-test outcomes from a Vitest JSON report, keyed by `<file> > <full name>`. The file
 * is made relative to `root` so reports from different checkouts compare. Repeated names
 * in one file get an ordinal suffix rather than overwriting each other.
 */
export function testStatuses(report, root = "") {
  const statuses = new Map();
  for (const file of report?.testResults ?? []) {
    const name = root && file.name.startsWith(root) ? file.name.slice(root.length + 1) : file.name;
    for (const test of file.assertionResults ?? []) {
      let key = `${name} > ${test.fullName}`;
      for (let n = 2; statuses.has(key); n++) key = `${name} > ${test.fullName} #${n}`;
      statuses.set(key, test.status);
    }
    // A file that failed to load contributes no tests; record the file itself.
    if ((file.assertionResults ?? []).length === 0 && file.status === "failed") {
      statuses.set(`${name} > (file failed to load)`, "failed");
    }
  }
  return statuses;
}

/** Tests whose status differs between two runs (a test missing from one run counts). */
export function statusChanges(before, after) {
  const changes = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const from = before.get(key) ?? "absent";
    const to = after.get(key) ?? "absent";
    if (from !== to) changes.push({ test: key, from, to });
  }
  return changes.sort((a, b) => a.test.localeCompare(b.test));
}

/**
 * A lower count is re-measured before it is reported. If the confirming run meets the
 * baseline, the observation is FLAKY: the app has a test whose outcome varies between
 * identical runs. That is worth naming, but it is not a change to report as one.
 */
export function confirmObservation(first, confirm, baseline) {
  const firstStatus = classifyObservation(first, baseline);
  if (firstStatus !== "CHANGED") return firstStatus;
  return classifyObservation(confirm, baseline) === "CHANGED" ? "CHANGED" : "FLAKY";
}

/**
 * What a conformance waiver must say. A waiver accepts a failure, so it names either the
 * issue that tracks the gap or a reason the gap can never close. A waiver with neither
 * hides a gap that nobody tracks.
 */

/** The reasons a gap can never close; the probe still checks everything else. */
export const PERMANENT_REASONS = [
  // A library's internal export, which its documentation says not to use.
  "n/a (internal)",
  // Exported only as a type, so there is nothing at runtime to check.
  "n/a (type-only)",
  // The library's own declaration disagrees with its implementation.
  "n/a (upstream declaration)",
] as const;

const ISSUE = /^#[1-9]\d*$/;

/** One line per waiver that names neither an issue nor a permanent reason, or has no reason. */
export function waiverProblems(
  waivers: readonly { export: string; path?: string; reason?: string; issue?: string }[],
): string[] {
  const problems: string[] = [];
  for (const waiver of waivers) {
    const at = `${waiver.export}${waiver.path && waiver.path !== waiver.export ? ` (${waiver.path})` : ""}`;
    const issue = waiver.issue ?? "";
    if (!ISSUE.test(issue) && !(PERMANENT_REASONS as readonly string[]).includes(issue)) {
      problems.push(
        `${at}: issue "${issue}" is neither an issue (#123) nor one of ${PERMANENT_REASONS.join(", ")}`,
      );
    }
    if (!waiver.reason?.trim()) problems.push(`${at}: no reason`);
  }
  return problems;
}

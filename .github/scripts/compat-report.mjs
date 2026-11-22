// compat-report (compat-check.yml): turns this run's failed checks into tracking issues.
// It runs in the one job that can write issues, which installs and runs no package code:
// it reads job results and log tails through the API. Pure helpers are exported for tests.

/** Job name (as shown in the run) → issue title and text. Titles match the issues earlier
 *  runs opened, so an open one gets a comment rather than a duplicate. */
export const ISSUES = [
  {
    job: /^Expo module tables/,
    title: () => "Expo module table differs from the newest jest-expo",
    text: "The weekly check found a jest-expo whose table of the native modules differs from the committed one, or a new Expo SDK without a table. The failed run prints the command to regenerate it; review the diff.",
  },
  {
    job: /^Check against current React Native edge/,
    title: () => "Compatibility gap detected with latest react-native",
    text: "The weekly check against react-native@latest failed. Run `bun run --filter vitest-native check-compat` locally to see export gaps.",
  },
  {
    job: /^Supported Expo SDKs at their newest patch/,
    title: () => "Compatibility: a supported Expo SDK fails at its newest patch",
    text: "The supported Expo SDKs, installed at their newest patch (at least seven days old), fail the packed consumer fixtures.",
  },
  {
    job: /^Conformance on the newest supported libraries/,
    title: () => "Library conformance: a supported library's newest release no longer matches",
    text: "The conformance probes failed on the newest release of a library inside its supported range (SUPPORTED_LIBRARY_VERSIONS). A preset or mock no longer matches the library's API; the failed run names the export.",
  },
  {
    job: /^Canary \((.+)\)$/,
    title: (match) => `Canary: the ${match[1]} prerelease fails`,
    text: "A canary (upstream's next release, ahead of latest) fails the gate.",
  },
];

/** The issue a failed job files, or null for a job no rule covers. */
export function issueFor(jobName) {
  for (const rule of ISSUES) {
    const match = rule.job.exec(jobName);
    if (match) return { title: rule.title(match), text: rule.text };
  }
  return null;
}

/** The issue or comment body. The log comes from installed packages and is untrusted, so
 *  it is shown only inside a code fence it cannot close. */
export function issueBody({ text, jobName, runUrl, log }) {
  const tail = String(log).split("\n").slice(-40).join("\n").replace(/`{3,}/g, "~~~");
  return [text, "", `Job: ${jobName}`, `Run: ${runUrl}`, "", "```text", tail, "```"].join("\n");
}

/** File or update an issue per failed check in this run. */
export async function report({ github, context, runUrl }) {
  const repo = { owner: context.repo.owner, repo: context.repo.repo };
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...repo,
    run_id: context.runId,
    filter: "latest",
  });
  const open = await github.paginate(github.rest.issues.listForRepo, {
    ...repo,
    state: "open",
    labels: "compat-check",
  });
  for (const job of jobs.filter((j) => j.conclusion === "failure")) {
    const issue = issueFor(job.name);
    if (!issue) continue;
    let log;
    try {
      ({ data: log } = await github.rest.actions.downloadJobLogsForWorkflowRun({
        ...repo,
        job_id: job.id,
      }));
    } catch (error) {
      log = `(log unavailable: ${error.message})`;
    }
    const body = issueBody({ text: issue.text, jobName: job.name, runUrl, log });
    const existing = open.find((candidate) => candidate.title === issue.title);
    if (existing) {
      await github.rest.issues.createComment({ ...repo, issue_number: existing.number, body });
    } else {
      await github.rest.issues.create({
        ...repo,
        title: issue.title,
        body,
        labels: ["compat-check"],
      });
    }
  }
}

// node scripts/ci/with-deadline.mjs <seconds> -- <command> [args…]
//
// Runs one CI step under the hang guard (scripts/ci/deadline.mjs): the command fails at
// the deadline with the files and tests that were still running, instead of holding the
// job until its own timeout. Exits with the command's code, or 1 at the deadline.
import { describeRunning, runWithDeadline } from "./deadline.mjs";

const [seconds, separator, command, ...args] = process.argv.slice(2);
if (!(Number(seconds) > 0) || separator !== "--" || !command) {
  console.error("usage: with-deadline.mjs <seconds> -- <command> [args…]");
  process.exit(2);
}
const { code, timedOut, running } = await runWithDeadline(command, args, {
  deadlineMs: Number(seconds) * 1000,
});
if (timedOut) {
  const github = process.env.GITHUB_ACTIONS === "true";
  const lines = [
    `\`${[command, ...args].join(" ")}\` passed its ${seconds} s deadline and was stopped.`,
    ...describeRunning(running),
  ];
  for (const line of lines) console.error(`${github ? "::error::" : "✗ "}${line}`);
}
process.exit(code);

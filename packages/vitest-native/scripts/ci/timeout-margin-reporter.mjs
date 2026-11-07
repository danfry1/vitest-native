// A Vitest reporter that names every passing test which used more than 60% of its
// timeout, so a test drifting toward its limit is seen before it times out.
//
// A test timeout is meant to measure the test. Work that is slow only the first time
// (a cold compile of the module graph a test imports, which on a Windows runner can take
// seconds) belongs in a beforeAll with its own budget; see
// tests-native/support/cold-import.ts. A test that still lands near its timeout is a
// flake waiting for a slow runner, and this reporter says which one.
//
// VN_TIMEOUT_MARGIN   share of the timeout that is reported, default 0.6.
//
// It reports and does not fail the run: the timeout itself is the failure. On GitHub
// Actions each test is also a warning annotation. Added by scripts/ci/vitest.mjs when
// VN_HANG_GUARD=1.
import fs from "node:fs";

const DEFAULT_MARGIN = 0.6;

export default class TimeoutMarginReporter {
  constructor({
    margin = Number(process.env.VN_TIMEOUT_MARGIN) || DEFAULT_MARGIN,
    github = process.env.GITHUB_ACTIONS === "true",
    // Straight to the file descriptor: Vitest's terminal renderer buffers process.stderr.
    write = (text) => fs.writeSync(2, text),
  } = {}) {
    this.margin = margin;
    this.github = github;
    this.write = write;
    this.near = [];
  }

  onTestCaseResult(testCase) {
    if (testCase.result().state !== "passed") return;
    const timeout = testCase.options.timeout;
    const duration = testCase.diagnostic()?.duration;
    // A test with no timeout (0 or Infinity) has no limit to drift toward.
    if (!timeout || !Number.isFinite(timeout) || duration === undefined) return;
    if (duration <= timeout * this.margin) return;
    this.near.push({ file: testCase.module.moduleId, name: testCase.fullName, duration, timeout });
  }

  onTestRunEnd() {
    if (this.near.length === 0) return;
    const percent = Math.round(this.margin * 100);
    const lines = [
      `${this.near.length} test(s) passed using more than ${percent}% of their timeout on ${process.platform}:`,
    ];
    for (const { file, name, duration, timeout } of this.near) {
      const share = Math.round((duration / timeout) * 100);
      const line = `${file} > ${name}: ${Math.round(duration)} ms of ${timeout} ms (${share}%)`;
      lines.push(
        this.github ? `::warning file=${file},title=Test near its timeout::${line}` : `  ${line}`,
      );
    }
    lines.push(
      "Move first-time work (a cold import) into a beforeAll with its own budget, or give the test a timeout that states what it measures.",
    );
    this.write(`${lines.join("\n")}\n`);
  }
}

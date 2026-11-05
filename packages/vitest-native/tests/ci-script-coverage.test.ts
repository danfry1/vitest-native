/**
 * Every package script is run on pull requests, or says why it is not.
 *
 * A gate that no workflow runs protects nothing: test:native:hot:state-manifest ran
 * only from prepublishOnly, which CI never runs and the release workflow skips with
 * --ignore-scripts, so a failing case sat on main unseen. This test fails when a
 * script is neither run by a pull-request workflow (directly, or through a script
 * that is) nor listed in NOT_ON_PULL_REQUESTS with its reason.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");
const workflowDir = path.resolve(packageRoot, "../../.github/workflows");
const scripts: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
).scripts;

/** Scripts deliberately not run on pull requests, with the reason. */
const NOT_ON_PULL_REQUESTS: Record<string, string> = {
  clean: "removes dist/; not a check",
  "fidelity:report": "regenerates the fidelity page; fidelity:check fails when it is stale",
  prepublishOnly: "a local pre-publish bundle of checks that CI runs as separate steps",
};

/** Workflows that run on pull requests, without their comment lines. */
const pullRequestWorkflows = fs
  .readdirSync(workflowDir)
  .filter((file) => file.endsWith(".yml"))
  .map((file) => ({ file, text: fs.readFileSync(path.join(workflowDir, file), "utf8") }))
  .filter(({ text }) => /^ {2}pull_request:/m.test(text))
  .map(({ file, text }) => ({
    file,
    text: text
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n"),
  }));

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whether `text` names the script `name` as a whole word (test:native is not test). */
const names = (text: string, name: string) =>
  new RegExp(`(?<![\\w:-])${escape(name)}(?![\\w:-])`).test(text);

function scriptsRunOnPullRequests(): Set<string> {
  const run = new Set(
    Object.keys(scripts).filter((name) =>
      pullRequestWorkflows.some(({ text }) => names(text, name)),
    ),
  );
  // A script run by one that runs counts too; prepublishOnly is not run in CI. A Set
  // visits entries added during iteration, so one pass follows every chain.
  for (const parent of run) {
    if (parent in NOT_ON_PULL_REQUESTS) continue;
    for (const name of Object.keys(scripts)) if (names(scripts[parent], name)) run.add(name);
  }
  return run;
}

describe("package scripts in CI", () => {
  const run = scriptsRunOnPullRequests();

  it("reads the pull-request workflows", () => {
    // A reader that found nothing would report every script as missing; one that
    // matched too loosely would pass everything.
    expect(pullRequestWorkflows.map(({ file }) => file)).toContain("ci.yml");
    expect(run.has("test:native:main")).toBe(true); // through test:native
    expect(names("bun run test:native:hot", "test:native")).toBe(false);
  });

  it("runs every script on pull requests, or records why not", () => {
    const missing = Object.keys(scripts).filter(
      (name) => !run.has(name) && !(name in NOT_ON_PULL_REQUESTS),
    );
    expect(missing, `run these in a pull-request workflow: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists only scripts that exist and are not run", () => {
    for (const name of Object.keys(NOT_ON_PULL_REQUESTS)) {
      expect(scripts).toHaveProperty([name]);
      expect(run.has(name)).toBe(false);
    }
  });
});

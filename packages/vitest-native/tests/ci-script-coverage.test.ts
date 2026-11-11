/**
 * Every package script is run on pull requests, or says why it is not.
 *
 * A gate that no workflow runs protects nothing: test:native:hot:state-manifest ran
 * only from prepublishOnly, which CI never runs and the release workflow skips with
 * --ignore-scripts, so a failing case sat on main unseen. This test fails when a
 * script is neither run on pull requests nor listed in NOT_ON_PULL_REQUESTS with its
 * reason.
 *
 * "Run" means invoked: a `bun run` in a step's `run:` of a workflow with a
 * pull_request trigger, in a step and job whose `if:` does not depend on the event or
 * on a docs-only change. A root script resolves to the package scripts it forwards to,
 * and a package script counts when a run script invokes it (`bun run`, or the
 * scripts/run-scripts.mjs list).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
const workflowDir = path.join(repoRoot, ".github/workflows");
const scriptsOf = (dir: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).scripts;
const scripts = scriptsOf(packageRoot);
const rootScripts = scriptsOf(repoRoot);

/** Scripts deliberately not run on pull requests, with the reason. */
const NOT_ON_PULL_REQUESTS: Record<string, string> = {
  clean: "removes dist/; not a check",
  format: "rewrites files; format:check is the check",
  "fidelity:report": "regenerates the fidelity page; fidelity:check fails when it is stale",
  "format:check": "CI runs the root format:check, which checks the same directories",
  lint: "CI runs the root lint, which lints the same directories",
  prepublishOnly: "a local pre-publish bundle of checks that CI runs as separate steps",
  "test:native:conformance-mock":
    "the mock engine's conformance job, to be its own CI job (pK); remove this entry when it is wired",
};

/** A step or job condition under which a pull request may not run it. */
const NOT_EVERY_PULL_REQUEST = /github\.event_name|docs-only == 'true'/;

interface Step {
  workflow: string;
  run: string;
  workingDirectory?: string;
}

/** The `run:` of every step a pull request runs, read line by line from each workflow. */
function pullRequestSteps(): Step[] {
  const steps: Step[] = [];
  for (const workflow of fs.readdirSync(workflowDir).filter((f) => f.endsWith(".yml"))) {
    const lines = fs.readFileSync(path.join(workflowDir, workflow), "utf8").split("\n");
    if (!lines.some((line) => /^ {2}pull_request:/.test(line))) continue;
    let jobIf = "";
    let step: (Step & { if: string }) | undefined;
    const flush = () => {
      if (step && step.run && !NOT_EVERY_PULL_REQUEST.test(`${jobIf} ${step.if}`)) steps.push(step);
      step = undefined;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^ {2}[\w-]+:\s*$/.test(line)) {
        flush();
        jobIf = "";
      } else if (/^ {4}if:/.test(line)) jobIf = line;
      else if (/^ {6}- /.test(line)) {
        flush();
        step = { workflow, run: "", if: "" };
      }
      if (!step) continue;
      const key = /^ {6}[- ] (\w[\w-]*):\s*(.*)$/.exec(line);
      if (key?.[1] === "if") step.if = key[2];
      else if (key?.[1] === "working-directory") step.workingDirectory = key[2];
      else if (key?.[1] === "run") {
        if (/^[|>]/.test(key[2])) {
          while (i + 1 < lines.length && (/^ {9,}/.test(lines[i + 1]) || !lines[i + 1].trim()))
            if (!/^\s*#/.test(lines[++i])) step.run += `${lines[i]}\n`;
        } else step.run = key[2];
      }
    }
    flush();
  }
  return steps;
}

/** `bun run [--filter <pkg>] <name>` calls in a command, as [filter, name]. */
const bunRuns = (command: string) =>
  [...command.matchAll(/\bbun run (?:--filter (\S+) )?([\w:-]+)/g)].map((m) => [m[1], m[2]]);

/** The package scripts a package script invokes. */
const calledBy = (body: string) => [
  ...bunRuns(body).map(([, name]) => name),
  ...(/scripts\/run-scripts\.mjs((?: [\w:-]+)+)/.exec(body)?.[1].trim().split(" ") ?? []),
];

/** The package scripts a root script reaches through `--filter vitest-native`. */
function throughRoot(name: string, seen = new Set<string>()): string[] {
  if (seen.has(name) || !(name in rootScripts)) return [];
  seen.add(name);
  return bunRuns(rootScripts[name]).flatMap(([filter, called]) =>
    filter === "vitest-native" ? [called] : filter ? [] : throughRoot(called, seen),
  );
}

function scriptsRunOnPullRequests(steps: Step[]): Set<string> {
  const run = new Set<string>();
  for (const step of steps) {
    for (const [filter, name] of bunRuns(step.run)) {
      if (filter === "vitest-native" || step.workingDirectory === "packages/vitest-native")
        run.add(name);
      else if (!filter) for (const called of throughRoot(name)) run.add(called);
    }
  }
  // A Set visits entries added during iteration, so one pass follows every chain.
  for (const parent of run) {
    if (!(parent in scripts) || parent in NOT_ON_PULL_REQUESTS) continue;
    for (const name of calledBy(scripts[parent])) run.add(name);
  }
  return new Set([...run].filter((name) => name in scripts));
}

describe("package scripts in CI", () => {
  const steps = pullRequestSteps();
  const run = scriptsRunOnPullRequests(steps);

  it("reads the steps that pull requests run", () => {
    // A reader that found nothing would report every script as missing; one that
    // matched too loosely would pass everything.
    expect(new Set(steps.map((step) => step.workflow))).toContain("ci.yml");
    expect(run.has("test:native:main")).toBe(true); // via run-scripts.mjs in test:native
    expect(run.has("test:native:hot:memory")).toBe(true); // via bun run in hot:isolation
    expect(run.has("build")).toBe(true); // via the root script
    // The docs job runs only on docs-only changes, so its step is not counted.
    expect(steps.some((step) => step.run === "bun run test:docs")).toBe(false);
    expect(bunRuns("bun run test:native:hot")).toEqual([[undefined, "test:native:hot"]]);
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

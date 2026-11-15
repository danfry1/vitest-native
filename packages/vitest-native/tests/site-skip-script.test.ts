import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Vercel runs website/scripts/skip-unless-site-changed.sh before each deployment: exit 0
// skips it. A pull request's branch used to build whenever main had changed the site since
// Vercel's last deployment, because the script diffed from that newer main commit. This
// runs the script in a scratch repository: main and a branch, as Vercel sees them.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(repoRoot, "website/scripts/skip-unless-site-changed.sh");

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "site-skip-"));
afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));
// Run outside any git hook's environment: GIT_DIR and the like would point at this repository.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);
const git = (...args: string[]) =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: repo,
    encoding: "utf8",
    env,
  }).trim();
function commit(file: string, text: string): string {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
  git("add", "-A");
  git("commit", "-q", "-m", file);
  return git("rev-parse", "HEAD");
}
/** Exit code of the script for a deployment of `head`, after Vercel's last one at `previous`. */
function skipScript(head: string, previous?: string): number {
  const run = spawnSync("bash", [SCRIPT], {
    cwd: repo,
    encoding: "utf8",
    env: { ...env, VERCEL_GIT_COMMIT_SHA: head, VERCEL_GIT_PREVIOUS_SHA: previous ?? "" },
  });
  return run.status ?? -1;
}

const SKIP = 0;
const BUILD = 1;

describe.skipIf(process.platform === "win32")("the Vercel skip script", () => {
  let start = "";
  let featureCode = "";
  let mainDocs = "";
  let mainCode = "";
  let branchDocs = "";
  let orphan = "";
  let mainTwoCommits = "";
  beforeAll(() => {
    git("init", "-q");
    git("checkout", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    start = commit("website/index.md", "# one\n");
    git("checkout", "-q", "-b", "feature");
    featureCode = commit("packages/vitest-native/src/plugin.ts", "// code\n");
    git("checkout", "-q", "main");
    mainDocs = commit("website/index.md", "# two\n");
    mainCode = commit("packages/vitest-native/src/other.ts", "// code\n");
    // A push of two commits whose site change is not in the last one.
    commit("website/index.md", "# three\n");
    mainTwoCommits = commit("packages/vitest-native/src/third.ts", "// code\n");
    git("checkout", "-q", "-b", "docs-branch", start);
    branchDocs = commit("website/guide.md", "# guide\n");
    git("checkout", "-q", "--orphan", "site-data");
    git("rm", "-q", "-rf", ".");
    orphan = commit("fidelity-matrix.md", "matrix\n");
  });

  it("skips a branch that changes no site input, though main changed the site since", () => {
    expect(skipScript(featureCode, mainDocs)).toBe(SKIP);
    expect(skipScript(featureCode)).toBe(SKIP);
  });

  it("builds a branch that changes the site", () => {
    expect(skipScript(branchDocs, mainDocs)).toBe(BUILD);
    expect(skipScript(branchDocs)).toBe(BUILD);
  });

  it("builds main when the site changed since its last deployment, and only then", () => {
    expect(skipScript(mainDocs, start)).toBe(BUILD);
    expect(skipScript(mainCode, mainDocs)).toBe(SKIP);
  });

  it("builds a push of several commits when one of them changed the site", () => {
    expect(skipScript(mainTwoCommits, mainCode)).toBe(BUILD);
  });

  it("builds when there is nothing to compare with", () => {
    expect(skipScript(start)).toBe(BUILD);
    // The previous deployment shares no history with this one (site-data's orphan commit).
    expect(skipScript(featureCode, orphan)).toBe(BUILD);
  });
});

// The site-data branch holds the fidelity matrix page for the site's build, not a site, so
// the commit the matrix workflow pushes there turns Vercel's deployments off for it.
describe("the site-data branch", () => {
  it("carries a vercel.json that turns its deployments off", () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, ".github/workflows/native-rn-matrix.yml"),
      "utf8",
    );
    expect(workflow).toContain(
      `printf '{ "git": { "deploymentEnabled": false } }\\n' > vercel.json`,
    );
    expect(workflow).toContain("git add fidelity-matrix.md vercel.json");
  });
});

// Every push to a branch Vercel watches creates a deployment, even one the skip script then
// cancels, and the plan caps deployments per day. Only main and docs/ branches deploy.
describe("which branches Vercel deploys", () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8"));
  it("is main and docs/ branches only", () => {
    expect(config.git.deploymentEnabled).toEqual({ "**": false, main: true, "docs/**": true });
  });
  it("is stated in CONTRIBUTING.md", () => {
    const contributing = fs.readFileSync(path.join(repoRoot, "CONTRIBUTING.md"), "utf8");
    expect(contributing).toContain("Vercel deploys only `main` and branches named `docs/…`");
  });
});

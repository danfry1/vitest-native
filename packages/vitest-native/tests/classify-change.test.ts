import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// .github/scripts/classify-change.sh decides whether CI's gate jobs run. A merge-queue
// group is classified like a pull request, over the diff from its base to its head
// (which spans every pull request queued in it); other events are never docs-only.
const script = path.resolve(import.meta.dirname, "../../../.github/scripts/classify-change.sh");
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function repoWith(changed: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-classify-"));
  roots.push(root);
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
  git("init", "-q");
  git("config", "user.email", "ci@example.invalid");
  git("config", "user.name", "ci");
  fs.writeFileSync(path.join(root, "README.md"), "base\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  for (const [file, text] of Object.entries(changed)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  git("add", "-A");
  git("commit", "-qm", "change");
  return { root, base, head: git("rev-parse", "HEAD") };
}

function classify(event: string, repo: ReturnType<typeof repoWith>) {
  const run = spawnSync("bash", [script, event, repo.base, repo.head], {
    cwd: repo.root,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: "" },
  });
  expect(run.status, run.stderr).toBe(0);
  return /docs-only=(true|false)/.exec(run.stdout)?.[1];
}

describe("classify-change.sh", () => {
  it("treats a docs-only merge-queue group like a docs-only pull request", () => {
    const repo = repoWith({ "README.md": "edited\n", ".changeset/x.md": "---\n---\n" });
    expect(classify("pull_request", repo)).toBe("true");
    expect(classify("merge_group", repo)).toBe("true");
  });

  it("runs the gate for a group that touches code", () => {
    const repo = repoWith({ "README.md": "edited\n", "packages/x/src/index.ts": "export {};\n" });
    expect(classify("merge_group", repo)).toBe("false");
  });

  it("never treats the generated fidelity pages as prose", () => {
    const repo = repoWith({ "website/guide/fidelity.md": "edited\n" });
    expect(classify("merge_group", repo)).toBe("false");
  });

  it("is never docs-only for a push to main", () => {
    const repo = repoWith({ "README.md": "edited\n" });
    expect(classify("push", repo)).toBe("false");
  });
});

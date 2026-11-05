import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs outside the package, no types
import { classify, GROUPS } from "../../../.github/scripts/classify-change.mjs";

// .github/scripts/classify-change.mjs decides which gate jobs a change runs. Only a pull
// request is narrowed; a merge-queue group is classified as docs-only like a pull
// request, over the diff from its base to its head, and otherwise runs everything.
const script = path.resolve(import.meta.dirname, "../../../.github/scripts/classify-change.mjs");
const P = "packages/vitest-native/";
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** The groups a change to `files` runs, in GROUPS order, with `unit` if it runs. */
const runs = (files: string[], event = "pull_request") => {
  const out = classify(event, files);
  return [...GROUPS, "unit"].filter((group) => out[group]);
};
const EVERYTHING = ["full", "packed", "rn", "axes"];

describe("change-based selection", () => {
  it("runs every group for code, manifests, the lockfile and unknown paths", () => {
    for (const file of [
      `${P}src/native/loader.mjs`,
      `${P}src/plugin.ts`,
      `${P}src/presets/reanimated.ts`,
      `${P}package.json`,
      "package.json",
      "bun.lock",
      `${P}tsdown.config.ts`,
      `${P}scripts/run-scripts.mjs`,
      ".github/actions/setup/action.yml",
      ".github/scripts/classify-change.mjs",
      `${P}validation/module-isolation/run-scale.mjs`,
      "a/new/directory/file.ts",
    ]) {
      expect(runs([file]), file).toEqual(EVERYTHING);
    }
  });

  it("narrows only the changes a group does not read", () => {
    expect(runs([`${P}tests/plugin.test.ts`])).toEqual(["full"]);
    expect(runs([`${P}tests-native/hot.test.tsx`])).toEqual(["full", "rn"]);
    expect(runs([`${P}crosscheck/probes/view.mjs`])).toEqual(["full", "rn"]);
    expect(runs([`${P}consumer-tests/bare/package.json`])).toEqual(["full", "packed"]);
    expect(runs(["apps/example/App.tsx"])).toEqual(["full", "packed"]);
    expect(runs([`${P}src/cli/init.ts`])).toEqual(["full", "packed"]);
    expect(runs([`${P}src/jest-compat/index.ts`])).toEqual(["full", "packed", "axes"]);
    expect(runs([".github/workflows/ci.yml"])).toEqual(["full", "packed"]);
    expect(runs([`${P}package-budget.json`])).toEqual(["full"]);
  });

  it("runs the unit checks whenever the Full gate is skipped and the change is not docs", () => {
    // Unit tests read workflows, validation scripts and the RN matrix definition.
    expect(runs([".github/rn-matrix.json"])).toEqual(["rn", "unit"]);
    expect(runs([".github/workflows/native-rn-matrix.yml"])).toEqual(["rn", "unit"]);
    expect(runs([`${P}validation/config-axes/cells.mjs`])).toEqual(["axes", "unit"]);
    expect(runs([".github/workflows/release.yml"])).toEqual(["unit"]);
    expect(runs([`${P}validation/bug-museum/run.mjs`])).toEqual(["unit"]);
    expect(runs(["bench/run.mjs"])).toEqual(["unit"]);
  });

  it("takes the union over every changed file", () => {
    expect(runs([`${P}tests/a.test.ts`, ".github/rn-matrix.json"])).toEqual(["full", "rn"]);
    expect(runs(["README.md", `${P}src/native/loader.mjs`])).toEqual(EVERYTHING);
  });

  it("runs nothing but the docs job for a docs-only change", () => {
    const out = classify("pull_request", ["README.md", ".changeset/x.md", "website/guide/a.md"]);
    expect(out).toEqual({
      "docs-only": true,
      full: false,
      packed: false,
      rn: false,
      axes: false,
      unit: false,
    });
    // The generated fidelity pages are gated by fidelity:check.
    expect(runs(["website/guide/fidelity.md"])).toEqual(EVERYTHING);
    expect(runs(["scripts/contributors.mjs"])).toEqual([]);
  });

  it("never narrows a push, a schedule, a manual run or a merge-queue group", () => {
    for (const event of ["push", "schedule", "workflow_dispatch", "merge_group"]) {
      expect(runs([`${P}tests/plugin.test.ts`], event), event).toEqual(EVERYTHING);
    }
    expect(classify("push", [])["docs-only"]).toBe(false);
    expect(classify("merge_group", ["README.md"])["docs-only"]).toBe(true);
  });
});

function repoWith(changed: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-classify-"));
  roots.push(root);
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
  const write = (files: Record<string, string>) => {
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), text);
    }
    git("add", "-A");
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "ci@example.invalid");
  git("config", "user.name", "ci");
  write({ "README.md": "base\n" });
  git("commit", "-qm", "base");
  git("checkout", "-qb", "topic");
  write(changed);
  git("commit", "-qm", "change");
  const head = git("rev-parse", "HEAD");
  // main moves on after the branch point; its files are not the pull request's.
  git("checkout", "-q", "main");
  write({ [`${P}src/native/loader.mjs`]: "// main moved\n" });
  git("commit", "-qm", "main moved");
  return { root, base: git("rev-parse", "HEAD"), head };
}

function cli(event: string, repo: ReturnType<typeof repoWith>) {
  const output = path.join(repo.root, "github-output");
  const run = spawnSync(process.execPath, [script, event, repo.base, repo.head], {
    cwd: repo.root,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: output },
  });
  expect(run.status, run.stderr).toBe(0);
  return Object.fromEntries(
    fs
      .readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split("=")),
  );
}

describe("classify-change.mjs", () => {
  it("classifies the pull request's own files, against its merge base", () => {
    const out = cli("pull_request", repoWith({ [`${P}tests/a.test.ts`]: "\n" }));
    expect(out).toEqual({
      "docs-only": "false",
      full: "true",
      packed: "false",
      rn: "false",
      axes: "false",
      unit: "false",
    });
  });

  it("treats a docs-only merge-queue group like a docs-only pull request", () => {
    const repo = repoWith({ "README.md": "edited\n", ".changeset/x.md": "---\n---\n" });
    expect(cli("pull_request", repo)["docs-only"]).toBe("true");
    expect(cli("merge_group", repo)["docs-only"]).toBe("true");
  });

  it("runs everything for a push to main", () => {
    const out = cli("push", repoWith({ "README.md": "edited\n" }));
    expect(out).toMatchObject({ "docs-only": "false", full: "true", rn: "true", unit: "false" });
  });
});

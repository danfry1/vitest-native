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
      // The native engine imports jest-compat; tests-native and packed fixtures read
      // tests/support.
      `${P}src/jest-compat/node-registry.mjs`,
      `${P}tests/support/bare-rn-root.ts`,
      `${P}tests/fixtures/app/index.js`,
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
    expect(runs([".github/workflows/ci.yml"])).toEqual(["full", "packed"]);
    expect(runs([`${P}package-budget.json`])).toEqual(["full"]);
  });

  it("runs the unit checks whenever the Full gate is skipped and the change is not docs", () => {
    // Unit tests read workflows, validation scripts and the RN matrix definition.
    expect(runs([".github/rn-matrix.json"])).toEqual(["full", "rn"]); // fidelity:check
    expect(runs([".github/workflows/native-rn-matrix.yml"])).toEqual(["rn", "unit"]);
    expect(runs([`${P}validation/config-axes/cells.mjs`])).toEqual(["axes", "unit"]);
    expect(runs([".github/workflows/release.yml"])).toEqual(["unit"]);
    expect(runs([`${P}validation/bug-museum/run.mjs`])).toEqual(["unit"]);
    expect(runs(["bench/run.mjs"])).toEqual(["unit"]);
  });

  it("takes the union over every changed file", () => {
    expect(runs([`${P}tests/a.test.ts`, ".github/workflows/native-rn-matrix.yml"])).toEqual([
      "full",
      "rn",
    ]);
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

describe("classify-change.mjs renames", () => {
  it("counts a moved file's old path, so moving code out of a gated path still runs it", () => {
    const repo = repoWith({ [`${P}src/native/core.mjs`]: "export const a = 1;\n".repeat(20) });
    const git = (...args: string[]) =>
      spawnSync("git", args, { cwd: repo.root, encoding: "utf8" }).stdout.trim();
    git("checkout", "-q", repo.head);
    const base = git("rev-parse", "HEAD");
    git("checkout", "-qb", "move");
    fs.mkdirSync(path.join(repo.root, `${P}src/cli`), { recursive: true });
    git("mv", `${P}src/native/core.mjs`, `${P}src/cli/core.mjs`);
    git("commit", "-qm", "move");
    const out = cli("pull_request", { root: repo.root, base, head: git("rev-parse", "HEAD") });
    expect(out).toMatchObject({ full: "true", packed: "true", rn: "true", axes: "true" });
  });
});

// The narrowings rest on what each skipped group reads. These read the gates' own
// sources, so a new reference across a narrowed boundary fails here instead of
// passing a pull request that skipped the gate that runs it.
const packageRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const next = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (/\.(mjs|cjs|js|ts|tsx|mts|json|yml|sh)$/.test(entry.name)) out.push(next);
    }
  };
  const root = path.join(repoRoot, dir);
  if (fs.existsSync(root) && fs.statSync(root).isFile()) return [root];
  walk(root);
  return out;
}
/** A source without its comment lines, so prose that names a path is not a read. */
const code = (file: string) =>
  fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*|#)/.test(line))
    .join("\n");
/** A repository-relative path with forward slashes, on every OS. */
const rel = (file: string) => path.relative(repoRoot, file).split(path.sep).join("/");
const referencing = (dirs: string[], pattern: RegExp) =>
  dirs
    .flatMap(sources)
    .filter((file) => pattern.test(code(file)))
    .map((file) => rel(file));
/** The repository's own apps/ workspaces, by name (fixtures have apps/ dirs of their own). */
const repoApps = new RegExp(
  `(?<![\\w-])apps/(?:${fs.readdirSync(path.join(repoRoot, "apps")).join("|")})\\b`,
);

describe("what each narrowed path is read by", () => {
  it("tests-native and crosscheck are not read by the packed or config-axis cells", () => {
    // Manual research runners that read tests-native; no workflow or package script
    // runs them. Wiring one into a gate must re-check the tests-native rule.
    const manual = [
      `${P}validation/module-isolation/inline-all.config.mts`,
      `${P}validation/module-isolation/run-native-hot-shape.mjs`,
      `${P}validation/module-isolation/run-scale.mjs`,
    ];
    const gates = [
      ...sources(".github"),
      path.join(packageRoot, "package.json"),
      ...sources(`${P}validation`).filter((file) => !manual.includes(rel(file))),
    ].map(code);
    for (const file of manual) {
      const name = path.basename(file);
      expect(
        gates.filter((text) => text.includes(name)),
        name,
      ).toEqual([]);
    }
    expect(
      referencing(
        [`${P}validation`, `${P}consumer-tests`, "apps", `${P}scripts/test-consumers.mjs`],
        /tests-native|crosscheck/,
      ).filter((file) => !manual.includes(file) && !/bug-museum\//.test(file)),
    ).toEqual([]);
  });

  it("consumer-tests and apps are not read by the RN matrix or config-axis cells", () => {
    expect(
      referencing(
        [`${P}tests-native`, `${P}crosscheck`, `${P}validation/config-axes`],
        new RegExp(`consumer-tests|${repoApps.source}`),
      ),
    ).toEqual([]);
  });

  it("only the CLI imports src/cli", () => {
    const outside = sources(`${P}src`).filter(
      (file) => !file.includes(`${path.sep}cli${path.sep}`),
    );
    expect(
      outside
        .filter((file) =>
          /from\s+["'][^"']*\/cli\/|import\(["'][^"']*\/cli\//.test(fs.readFileSync(file, "utf8")),
        )
        .map((file) => rel(file)),
    ).toEqual([]);
  });

  it("no gate outside the unit suite reads a unit test file", () => {
    expect(
      referencing(
        [
          `${P}tests-native`,
          `${P}validation`,
          `${P}scripts`,
          `${P}consumer-tests`,
          `${P}crosscheck`,
        ],
        /(?<![\w-])tests\/[\w.-]+\.test\.tsx?\b/,
      ),
    ).toEqual([]);
  });
});

describe("the workflows that use the classification", () => {
  it("read only outputs their classify job declares, and gate each group on it", () => {
    const expected: Record<string, string[]> = {
      "ci.yml": ["docs-only", "full", "packed", "unit"],
      "native-rn-matrix.yml": ["rn"],
      "config-axis-matrix.yml": ["axes"],
    };
    for (const [workflow, keys] of Object.entries(expected)) {
      const text = fs.readFileSync(path.join(repoRoot, ".github/workflows", workflow), "utf8");
      const declared = [
        ...text.matchAll(/^ {6}([\w-]+): \$\{\{ steps\.docs\.outputs\.([\w-]+) \}\}/gm),
      ];
      for (const [, key, output] of declared) expect(output, workflow).toBe(key);
      expect(declared.map((m) => m[1]).sort(), workflow).toEqual([...keys].sort());
      const used = new Set(
        [...text.matchAll(/needs\.classify\.outputs\.([\w-]+)/g)].map((m) => m[1]),
      );
      for (const key of used) {
        if (key === "matrix" || key === "scope") continue;
        expect(keys, `${workflow} reads ${key}`).toContain(key);
      }
      // Fail closed: a missing output runs the group.
      for (const key of keys.filter((k) => k !== "docs-only"))
        expect(text, `${workflow}: ${key}`).toContain(
          `if: needs.classify.outputs.${key} != 'false'`,
        );
      expect(text).toContain(
        'node .github/scripts/classify-change.mjs "$EVENT" "$BASE_SHA" "$HEAD_SHA"',
      );
    }
    expect([...GROUPS, "unit"].sort()).toEqual(["axes", "full", "packed", "rn", "unit"]);
  });
});

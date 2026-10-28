/**
 * Releases are cut from the changeset queue, so a change to shipped source with no
 * entry reaches users with no changelog line and contributes nothing to the version
 * bump. Nothing checked for it.
 *
 * The gap was measured rather than supposed: of thirteen pull requests opened in a
 * single session, exactly two touched `packages/vitest-native/src/` — a new warning
 * users would see when the precompiled registry cannot be built, and a change to
 * what `doctor` reports about a project's config. Neither had a changeset, and every
 * gate on both was green.
 *
 * Comment-only edits and internal refactors genuinely need no release note. They
 * need `bunx changeset --empty`, which records that decision instead of leaving it
 * to be inferred from an absence.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assessChangeset, MANIFEST, shippedManifestChanges } from "../scripts/check-changeset.mjs";

const SRC = "packages/vitest-native/src/cli/doctor.ts";

describe("assessChangeset", () => {
  it("requires one when shipped source changes", () => {
    const result = assessChangeset([SRC, "packages/vitest-native/tests/doctor.test.ts"]);
    expect(result.ok).toBe(false);
    expect(result.shipped).toEqual([SRC]);
  });

  it("is satisfied by a changeset alongside the change", () => {
    expect(assessChangeset([SRC, ".changeset/some-fix.md"]).ok).toBe(true);
  });

  it("does not require one when no shipped source changed", () => {
    const result = assessChangeset([
      ".github/workflows/ci.yml",
      "packages/vitest-native/scripts/check-package-size.mjs",
      "packages/vitest-native/tests/a.test.ts",
      "website/guide/plugin-options.md",
    ]);
    expect(result.ok).toBe(true);
    expect(result.shipped).toEqual([]);
  });

  it("does not accept the changeset README as a changeset", () => {
    // It is the only .md that lives there permanently, so counting it would make
    // every check pass forever.
    expect(assessChangeset([SRC, ".changeset/README.md"]).ok).toBe(false);
  });

  it("does not accept the changeset config as a changeset", () => {
    expect(assessChangeset([SRC, ".changeset/config.json"]).ok).toBe(false);
  });

  it("reports every shipped file, not just the first", () => {
    const files = [SRC, "packages/vitest-native/src/native/registry.mjs"];
    expect(assessChangeset(files).shipped).toEqual(files);
  });

  it("does not mistake a similarly-named path for shipped source", () => {
    // `scripts/` and `tests/` sit beside `src/` under the same package.
    const result = assessChangeset([
      "packages/vitest-native/src-notes/todo.md",
      "packages/vitest-native/scripts/src/helper.mjs",
    ]);
    expect(result.shipped).toEqual([]);
  });
});

describe("shipped build files and package.json fields", () => {
  it("requires one when a build file that decides dist/ changes", () => {
    for (const file of [
      "packages/vitest-native/tsdown.config.ts",
      "packages/vitest-native/scripts/copy-static-types.mjs",
    ]) {
      expect(assessChangeset([file]).ok, file).toBe(false);
      expect(assessChangeset([file, ".changeset/x.md"]).ok, file).toBe(true);
    }
  });

  it("requires one when a shipped manifest field changes", () => {
    const result = assessChangeset([MANIFEST], ["engines"]);
    expect(result.ok).toBe(false);
    expect(result.shipped).toEqual([`${MANIFEST}#engines`]);
  });

  const base = {
    name: "vitest-native",
    version: "1.0.0",
    engines: { node: ">=22.13.0" },
    exports: { ".": { types: "./dist/index.d.mts", default: "./dist/index.mjs" } },
    peerDependencies: { vitest: ">=4 <6" },
    dependencies: { "magic-string": "0.30.0" },
    devDependencies: { typescript: "5.0.0" },
    scripts: { test: "vitest run" },
  };
  const changes = (edit: (manifest: typeof base) => void) => {
    const after = structuredClone(base);
    edit(after);
    return shippedManifestChanges(JSON.stringify(base), JSON.stringify(after));
  };

  it.each([
    ["engines", (m: typeof base) => void (m.engines.node = ">=22.15.0")],
    ["exports", (m: typeof base) => void (m.exports["."].default = "./dist/other.mjs")],
    ["peerDependencies", (m: typeof base) => void (m.peerDependencies.vitest = ">=4 <7")],
    ["dependencies", (m: typeof base) => void (m.dependencies["magic-string"] = "0.31.0")],
  ])("names %s", (field, edit) => {
    expect(changes(edit)).toEqual([field]);
  });

  it("names bin, publishConfig and typesVersions", () => {
    const before = JSON.stringify(base);
    const edits: [string, Record<string, unknown>][] = [
      ["bin", { bin: { "vitest-native": "./dist/cli.mjs" } }],
      ["publishConfig", { publishConfig: { access: "public" } }],
      ["typesVersions", { typesVersions: { "*": { helpers: ["dist/helpers.d.mts"] } } }],
    ];
    for (const [field, edit] of edits) {
      expect(shippedManifestChanges(before, JSON.stringify({ ...base, ...edit }))).toEqual([field]);
    }
  });

  it("ignores reordering a files list or a dependency map", () => {
    const before = { ...base, files: ["dist", "LICENSE"] };
    const after = {
      ...before,
      files: ["LICENSE", "dist"],
      dependencies: { b: "1.0.0", a: "1.0.0" },
    };
    const withDeps = { ...before, dependencies: { a: "1.0.0", b: "1.0.0" } };
    expect(shippedManifestChanges(JSON.stringify(withDeps), JSON.stringify(after))).toEqual([]);
  });

  it("treats a reordered exports map as a change: condition order picks the target", () => {
    expect(
      changes((m) => {
        m.exports["."] = { default: "./dist/index.mjs", types: "./dist/index.d.mts" };
      }),
    ).toEqual(["exports"]);
  });

  it("does not require one for fields that never reach consumers", () => {
    expect(
      changes((m) => {
        m.version = "1.1.0";
        m.devDependencies.typescript = "5.1.0";
        m.scripts.test = "vitest run --reporter dot";
      }),
    ).toEqual([]);
  });
});

describe("check-changeset.mjs against a repository", () => {
  const script = path.resolve(import.meta.dirname, "../scripts/check-changeset.mjs");
  const roots: string[] = [];
  afterAll(() => {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  });

  function run(edit: (manifest: Record<string, unknown>) => void) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-changeset-"));
    roots.push(root);
    const git = (...args: string[]) =>
      spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
    const manifestPath = path.join(root, MANIFEST);
    const manifest: Record<string, unknown> = {
      name: "vitest-native",
      engines: { node: ">=22.13.0" },
      devDependencies: { typescript: "5.0.0" },
    };
    git("init", "-q");
    git("config", "user.email", "ci@example.invalid");
    git("config", "user.name", "ci");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    git("add", "-A");
    git("commit", "-qm", "base");
    const baseSha = git("rev-parse", "HEAD");
    edit(manifest);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    git("commit", "-qam", "change");
    return spawnSync(process.execPath, [script, baseSha, "HEAD"], { cwd: root, encoding: "utf8" });
  }

  it("fails an engines change with no changeset (#328's shape)", () => {
    const result = run((m) => {
      m.engines = { node: ">=22.15.0" };
    });
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain(`${MANIFEST}#engines`);
  });

  it("compares the manifest from the merge base, not the moved base branch", () => {
    // main changes `engines` after the branch point; the branch only bumps a
    // devDependency. Against main's tip the branch's manifest would show an engines
    // difference it never made.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-changeset-"));
    roots.push(root);
    const git = (...args: string[]) =>
      spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
    const manifestPath = path.join(root, MANIFEST);
    const write = (manifest: Record<string, unknown>) =>
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const manifest = {
      name: "vitest-native",
      engines: { node: ">=22.13.0" },
      devDependencies: { typescript: "5.0.0" },
    };
    git("init", "-q", "-b", "main");
    git("config", "user.email", "ci@example.invalid");
    git("config", "user.name", "ci");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    write(manifest);
    git("add", "-A");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "branch");
    write({ ...manifest, devDependencies: { typescript: "5.1.0" } });
    git("commit", "-qam", "branch: devDependency");
    git("checkout", "-q", "main");
    write({ ...manifest, engines: { node: ">=22.15.0" } });
    git("commit", "-qam", "main: engines");
    const result = spawnSync(process.execPath, [script, "main", "branch"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("passes a devDependency bump with no changeset", () => {
    const result = run((m) => {
      m.devDependencies = { typescript: "5.1.0" };
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});

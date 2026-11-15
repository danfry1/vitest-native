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
 * need `bun run changeset --empty`, which records that decision instead of leaving it
 * to be inferred from an absence.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  assessChangeset,
  BANNED_TERMS,
  BODY_WORD_LIMIT,
  changesetFiles,
  CREDIT_LINE,
  CREDIT_REASON_WORD_LIMIT,
  LEAD_WORD_LIMIT,
  lintChangeset,
  MANIFEST,
  shippedManifestChanges,
} from "../scripts/check-changeset.mjs";

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
      "packages/vitest-native/scripts/verbatim-runtime.mjs",
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
    // An exit of 0 alone is also what a script that never ran returns.
    expect(result.stdout).toContain("✓ no shipped source");
  });

  function runWithChangeset(name: string, text: string | null) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-changeset-"));
    roots.push(root);
    const git = (...args: string[]) =>
      spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
    const file = path.join(root, ".changeset", name);
    git("init", "-q");
    git("config", "user.email", "ci@example.invalid");
    git("config", "user.name", "ci");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, GOOD);
    git("add", "-A");
    git("commit", "-qm", "base");
    const baseSha = git("rev-parse", "HEAD");
    if (text == null) fs.rmSync(file);
    else fs.writeFileSync(file, text);
    git("add", "-A");
    git("commit", "-qm", "change");
    return spawnSync(process.execPath, [script, baseSha, "HEAD"], { cwd: root, encoding: "utf8" });
  }

  it("fails a changeset that does not follow the style, naming the file and the problem", () => {
    const result = runWithChangeset("long.md", patch("A fix since rc.4. No action needed."));
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain(".changeset/long.md does not follow the changeset style");
    expect(result.stderr).toContain("no bold lead");
    expect(result.stderr).toContain("refers to a release candidate");
  });

  it("passes a changeset that follows the style", () => {
    const result = runWithChangeset("ok.md", GOOD.replace("Windows", "macOS"));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("✓ 1 changeset(s) follow the changeset style");
  });

  it("does not check a deleted changeset: a release consumes them all", () => {
    const result = runWithChangeset("gone.md", null);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("checks files on disk with --lint", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-changeset-"));
    roots.push(dir);
    fs.writeFileSync(path.join(dir, "bad.md"), patch("**Lead.** It changed."));
    fs.writeFileSync(path.join(dir, "README.md"), "# Changesets\n");
    const bad = spawnSync(process.execPath, [script, "--lint", path.join(dir, "bad.md")], {
      encoding: "utf8",
    });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("no action line");
    const readme = spawnSync(process.execPath, [script, "--lint", path.join(dir, "README.md")], {
      encoding: "utf8",
    });
    expect(readme.status, readme.stderr).toBe(0);
  });

  it("passes a devDependency bump with no changeset", () => {
    const result = run((m) => {
      m.devDependencies = { typescript: "5.1.0" };
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});

const REPO = path.resolve(import.meta.dirname, "../../..");
const patch = (body: string) => `---\n"vitest-native": patch\n---\n\n${body}\n`;
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const GOOD = patch(
  "**Native engine: `hot: true` works on Windows.** Tests that failed with `EPERM` now run. No action needed.",
);

describe("lintChangeset", () => {
  it("passes the example in CONTRIBUTING.md", () => {
    // The documented example is the style; it must pass the check that enforces it.
    const contributing = fs.readFileSync(path.join(REPO, "CONTRIBUTING.md"), "utf8");
    const section = contributing.slice(contributing.indexOf("## Writing a changeset"));
    const example = /```md\n([\s\S]*?)```/.exec(section)?.[1];
    expect(example).toContain('"vitest-native": patch');
    expect(lintChangeset(example!)).toEqual([]);
  });

  it("passes every changeset currently in .changeset/", () => {
    const dir = path.join(REPO, ".changeset");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      if (file === "README.md") continue;
      expect(lintChangeset(fs.readFileSync(path.join(dir, file), "utf8")), file).toEqual([]);
    }
  });

  it("passes a short entry with a lead, an error and an action", () => {
    expect(lintChangeset(GOOD)).toEqual([]);
  });

  it("fails the 0.14.0 entry the CONTRIBUTING example rewrites", () => {
    const before = patch(
      [
        "**Under the native engine, a package that depends on a workspace library now compiles the installed React Native packages that library depends on.** A feature package depending on a workspace UI library that declares `expo-image` failed with `Cannot find module '…/expo-asset/build/Asset.fx'`: `expo-asset`, reached through `expo-image` and `expo`, was never compiled, because only the feature package's own declarations were followed. No action needed.",
        "",
        "- The same applies to a workspace library imported through a string `resolve.alias` entry or, where Vite resolves them, tsconfig `paths`, without being declared. With `diagnostics: true` the plugin names such a library.",
        "- What changes: more installed packages are compiled and loaded by Node in these projects. As for every Node-loaded package, a `vi.mock` from a test does not reach their internal imports.",
        "- Unchanged: which owner a workspace library has. This change adds only installed packages (in `node_modules`), never a workspace member.",
        "- Not covered: aliases with a regular-expression `find`, aliases other plugins add (vite-tsconfig-paths, Nx's `nxViteTsPaths`), and a `setupFiles` entry pointing into an undeclared workspace library; none of these is followed. Declaring the library as a dependency covers them.",
      ].join("\n"),
    );
    const problems = lintChangeset(before);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/is \d+ words; the limit is 110/);
    expect(problems[1]).toContain('internal term "owner"');
  });

  describe("exemptions", () => {
    it.each([
      ["an empty changeset", "---\n---\n"],
      ["an empty changeset with no trailing newline", "---\n---"],
      ["another package", '---\n"vitest-native-bakeoffs": patch\n---\n\nrc.1 closure, long.'],
    ])("exempts %s", (_name, text) => {
      expect(lintChangeset(text)).toEqual([]);
    });

    it("checks a changeset that bumps vitest-native among other packages", () => {
      const text = `---\n"other": patch\n'vitest-native': minor\n---\n\nNo lead. No action needed.\n`;
      expect(lintChangeset(text)).toEqual([expect.stringContaining("no bold lead")]);
    });
  });

  describe("the bold lead", () => {
    it("requires one at the start", () => {
      expect(lintChangeset(patch("Fixes a crash. **Bold later.** No action needed."))).toEqual([
        expect.stringContaining("no bold lead"),
      ]);
    });

    it(`allows ${LEAD_WORD_LIMIT} words and names the limit past it`, () => {
      const at = patch(`**${words(LEAD_WORD_LIMIT)}.** No action needed.`);
      const over = patch(`**${words(LEAD_WORD_LIMIT + 1)}.** No action needed.`);
      expect(lintChangeset(at)).toEqual([]);
      expect(lintChangeset(over)).toEqual([
        `the bold lead is ${LEAD_WORD_LIMIT + 1} words; the limit is ${LEAD_WORD_LIMIT} (aim for ~25)`,
      ]);
    });
  });

  describe("length", () => {
    // The lead and the action line are 4 words: "**Lead.** No action needed."
    const withBody = (n: number) => patch(`**Lead.** No action needed.\n\n${words(n - 4)}`);

    it(`allows ${BODY_WORD_LIMIT} words and names the limit past it`, () => {
      expect(lintChangeset(withBody(BODY_WORD_LIMIT))).toEqual([]);
      const problems = lintChangeset(withBody(BODY_WORD_LIMIT + 1));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(
        new RegExp(`^the entry is ${BODY_WORD_LIMIT + 1} words; the limit is ${BODY_WORD_LIMIT}`),
      );
    });

    it("counts a code span as one word, so quoting an exact error costs nothing extra", () => {
      const error = "`" + words(50) + "`";
      expect(lintChangeset(patch(`**Lead ${error}.** No action needed. ${error}`))).toEqual([]);
    });

    it("does not count Markdown punctuation as words", () => {
      const bullets = Array.from({ length: 40 }, () => "- -- **").join("\n");
      expect(lintChangeset(withBody(BODY_WORD_LIMIT) + bullets)).toEqual([]);
    });
  });

  describe("the action line", () => {
    it.each([
      ["No action needed", "**Lead.** No action needed."],
      ["an imperative after the lead", "**Lead.** Set `hot: false` to opt out."],
      [
        "an imperative bullet",
        "**Lead.** It changed.\n\n- Remove `transform` entries added for it.",
      ],
      ["an imperative on its own line", "**Lead.** It changed.\n\nUpgrade to Vitest 5."],
      ['"To …, verb"', "**Lead.** It changed. To opt out, pass `hot: false`."],
    ])("accepts %s", (_name, body) => {
      expect(lintChangeset(patch(body))).toEqual([]);
    });

    it.each([
      ["none", "**Lead.** It changed."],
      ["a verb mid-sentence", "**Lead.** Projects that use `hot` and set it run."],
      ["a verb inside the lead only", "**Set `hot` now works.** It changed."],
    ])("rejects %s", (_name, body) => {
      expect(lintChangeset(patch(body))).toEqual([expect.stringContaining("no action line")]);
    });
  });

  describe("release candidates", () => {
    it.each(["0.14.0-rc.10", "rc.11", "RC.2"])("rejects %s", (version) => {
      const problems = lintChangeset(patch(`**Lead.** Broken in ${version}. No action needed.`));
      expect(problems).toEqual([expect.stringContaining("refers to a release candidate")]);
    });

    it("does not mistake src. or a stable version for one", () => {
      expect(lintChangeset(patch("**Lead in src.1 and 0.13.2.** No action needed."))).toEqual([]);
    });
  });

  describe("internal terms", () => {
    it.each([
      ["Node-owned", "the library is Node-owned"],
      ["vite-owned", "the file is vite-owned"],
      ["ownership", "the ownership policy"],
      ["owner", "which owner it has"],
      ["closure", "the closure walk"],
      ["registry", "the registry is rebuilt"],
    ])("rejects %s", (term, phrase) => {
      expect(lintChangeset(patch(`**Lead.** No action needed. Now ${phrase}.`))).toEqual([
        expect.stringContaining(`internal term "${term}"`),
      ]);
    });

    it("names the replacement", () => {
      const [problem] = lintChangeset(patch("**Lead.** No action needed. It is Node-owned."));
      expect(problem).toContain(
        "loaded by Node (a `vi.mock` from a test does not reach its imports)",
      );
    });

    it("allows them in code spans, inside other words and after npm", () => {
      const body =
        "**Lead.** No action needed. `MODULE_OWNER_CONFLICT`, `the ownership policy`, " +
        "`TurboModuleRegistry.get`, a closures-free owned-by-default build, the npm registry.";
      expect(lintChangeset(patch(body))).toEqual([]);
    });

    it("names every term used, not only the first", () => {
      const problems = lintChangeset(
        patch("**Lead.** No action needed. The closure is Node-owned."),
      );
      expect(problems).toEqual([
        expect.stringContaining('"Node-owned"'),
        expect.stringContaining('"closure"'),
      ]);
    });

    it("lists a replacement for every term", () => {
      for (const { term, instead } of BANNED_TERMS) expect(instead.length, term).toBeGreaterThan(0);
    });
  });

  it("reports every problem at once", () => {
    const text = patch(`No lead, Node-owned since rc.3. ${words(BODY_WORD_LIMIT)}`);
    expect(lintChangeset(text)).toHaveLength(5);
  });
});

describe("changesetFiles", () => {
  it("picks changeset entries only", () => {
    expect(
      changesetFiles([
        ".changeset/a-fix.md",
        ".changeset/README.md",
        ".changeset/config.json",
        "docs/.changeset/x.md",
        "packages/vitest-native/CHANGELOG.md",
      ]),
    ).toEqual([".changeset/a-fix.md"]);
  });
});

describe("credit lines", () => {
  const entry = (credit: string) => patch(`**Lead.** No action needed.\n\n${credit}`);

  it.each([
    "Thanks @octo-cat for reporting this (#12).",
    "Thanks @octocat for the fix (#12).",
    "Thanks @octocat for the pull request (#12).",
    "Thanks @a1 and @b-2 for reporting this (#12, #14).",
    "Thanks @a, @b and @c for reporting and fixing this (#12).",
    "Thanks @a, @b, and @c for the reports (#12, #14, #15).",
    `Thanks @${"a".repeat(39)} for reporting this (#1).`,
  ])("accepts %s", (credit) => {
    expect(CREDIT_LINE.test(credit)).toBe(true);
    expect(lintChangeset(entry(credit))).toEqual([]);
  });

  it.each([
    ["no reference", "Thanks @octocat for reporting this."],
    ["a reference without #", "Thanks @octocat for reporting this (12)."],
    ["no full stop", "Thanks @octocat for reporting this (#12)"],
    ["no handle", "Thanks octocat for reporting this (#12)."],
    ["'Thanks to'", "Thanks to @octocat for reporting this (#12)."],
    ["no reason", "Thanks @octocat (#12)."],
    ["a handle ending in a hyphen", "Thanks @octocat- for reporting this (#12)."],
    ["a double hyphen", "Thanks @octo--cat for reporting this (#12)."],
    ["a 40-character handle", `Thanks @${"a".repeat(40)} for reporting this (#12).`],
    ["lower case", "thanks @octocat for reporting this (#12)."],
    ["'Thank you'", "Thank you @octocat for reporting this (#12)."],
  ])("rejects a credit line with %s, naming the format", (_name, credit) => {
    expect(CREDIT_LINE.test(credit)).toBe(false);
    expect(lintChangeset(entry(credit))).toEqual([
      expect.stringContaining(`malformed credit line "${credit}"`),
    ]);
  });

  it("is not counted in the entry's length", () => {
    // "**Lead.** No action needed." is 4 words.
    const full = patch(`**Lead.** No action needed.\n\n${words(BODY_WORD_LIMIT - 4)}`);
    expect(lintChangeset(full)).toEqual([]);
    expect(lintChangeset(`${full}\nThanks @octocat for reporting this (#12).\n`)).toEqual([]);
  });

  it("is not checked for internal terms: a handle is a name", () => {
    expect(lintChangeset(entry("Thanks @closure-owner for the fix (#12)."))).toEqual([]);
  });

  it("does not count as the action line", () => {
    expect(lintChangeset(patch("**Lead.**\n\nThanks @octocat for the fix (#12)."))).toEqual([
      expect.stringContaining("no action line"),
    ]);
  });

  it("goes last: several may close the entry, none may precede the details", () => {
    const two = "Thanks @a for reporting this (#12).\nThanks @b for the fix (#13).";
    expect(lintChangeset(entry(two))).toEqual([]);
    const early = patch(
      "**Lead.** No action needed.\n\nThanks @a for reporting this (#12).\n\n- A detail.",
    );
    expect(lintChangeset(early)).toEqual([
      "a credit line goes at the end of the entry, after the details",
    ]);
  });

  it("accepts the credit line CONTRIBUTING.md documents", () => {
    const contributing = fs.readFileSync(path.join(REPO, "CONTRIBUTING.md"), "utf8");
    const documented = /`(Thanks @[^`]+)`/.exec(contributing)?.[1];
    expect(documented).toBe("Thanks @handle for reporting this (#12).");
    expect(CREDIT_LINE.test(documented!)).toBe(true);
  });

  it("leaves prose that starts with 'Thanks to' alone", () => {
    const body = "**Lead.** No action needed.\n\nThanks to the new resolver, startup is quicker.";
    expect(lintChangeset(patch(body))).toEqual([]);
  });

  it("does not read a line in a code fence as a credit", () => {
    const body = "**Lead.** No action needed.\n\n```txt\nThanks @bot (#1)\n```\n\n- A detail.";
    expect(lintChangeset(patch(body))).toEqual([]);
  });

  it("holds the reason to a few words in the user's vocabulary", () => {
    const long = "Thanks @a for the fix to the hot runtime regression they found (#12).";
    expect(lintChangeset(entry(long))).toEqual([
      expect.stringContaining(`says more than ${CREDIT_REASON_WORD_LIMIT} words`),
    ]);
    expect(lintChangeset(entry("Thanks @a for the registry fix (#12)."))).toEqual([
      expect.stringContaining('internal term "registry"'),
    ]);
    expect(lintChangeset(entry("Thanks @a for the rc.3 fix (#12)."))).toEqual([
      expect.stringContaining('"rc.3" in a credit line'),
    ]);
  });

  it("reports a malformed credit after the style's own problems", () => {
    const problems = lintChangeset(patch("No lead.\n\nThanks @octocat."));
    expect(problems[0]).toContain("no bold lead");
    expect(problems.at(-1)).toContain("malformed credit line");
  });
});

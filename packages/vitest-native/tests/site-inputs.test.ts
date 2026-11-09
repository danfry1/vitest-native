import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The site deploys only when something it is built from changes: Vercel skips a build
// through website/scripts/skip-unless-site-changed.sh, and GitHub Pages filters pushes by
// path in .github/workflows/pages.yml. Both lists name the files the build reads from
// outside website/ (website/.vitepress imports the package's own source for the site's
// address and the supported versions). This derives that set from the build's imports, so
// an input added later cannot leave the site stale without a failing test.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WEBSITE = path.join(repoRoot, "website");
const SKIP_SCRIPT = path.join(WEBSITE, "scripts/skip-unless-site-changed.sh");
const PAGES = path.join(repoRoot, ".github/workflows/pages.yml");
const SOURCE = /\.(ts|mts|mjs|js|vue|md)$/;
const EXTENSIONS = ["", ".ts", ".mts", ".mjs", ".js", ".vue", ".md"];

const rel = (file: string) => path.relative(repoRoot, file).split(path.sep).join("/");

/** Tracked site sources: every file under website/ the build can read. */
function siteSources(): string[] {
  return execFileSync("git", ["ls-files", "website"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((file) => SOURCE.test(file))
    .map((file) => path.join(repoRoot, file));
}

/** The files a source imports: relative imports, and VitePress's `<<< @/` code imports. */
function importsOf(file: string): string[] {
  // In a Markdown page, a fenced code block is an example for the reader, not an import.
  const raw = fs.readFileSync(file, "utf8");
  const text = file.endsWith(".md") ? raw.replace(/^(```|~~~)[\s\S]*?^\1/gm, "") : raw;
  const specifiers = [
    ...[...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
  ].filter((s) => s.startsWith("."));
  const codeImports = [...text.matchAll(/^<<< @\/(\S+?)(?:\{|\s|$)/gm)].map((m) =>
    path.join(WEBSITE, m[1]),
  );
  const resolved = specifiers.map((s) => {
    const base = path.resolve(path.dirname(file), s.replace(/\?.*$/, ""));
    const found = EXTENSIONS.map((ext) => base + ext).find(
      (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    if (!found) throw new Error(`${rel(file)} imports ${s}, which does not resolve`);
    return found;
  });
  return [...resolved, ...codeImports];
}

/** Every file outside website/ the build reaches, following imports from there on. */
function inputsOutsideWebsite(): Set<string> {
  const outside = new Set<string>();
  const queue = siteSources().flatMap(importsOf);
  while (queue.length) {
    const file = queue.pop()!;
    if (file.startsWith(WEBSITE + path.sep) || outside.has(rel(file))) continue;
    outside.add(rel(file));
    queue.push(...importsOf(file));
  }
  return outside;
}

function skipScriptInputs(): string[] {
  const block = /SITE_INPUTS=\(\n([\s\S]*?)\n\)/.exec(fs.readFileSync(SKIP_SCRIPT, "utf8"))?.[1];
  return (block ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function pagesPushPaths(): string[] {
  const yml = fs.readFileSync(PAGES, "utf8");
  const block =
    /\n  push:\n[\s\S]*?\n    paths:\n((?:\s+(?:#.*|- '[^']+')\n)+)/.exec(yml)?.[1] ?? "";
  return [...block.matchAll(/- '([^']+)'/g)].map((m) => m[1]);
}

/** Whether a path list covers a file: the file itself, or a directory (`dir` or `dir/**`). */
const covers = (list: string[], file: string) =>
  list.some((entry) => {
    const dir = entry.replace(/\/\*\*$/, "");
    return file === dir || file.startsWith(`${dir}/`);
  });

describe("what the site is built from", () => {
  const derived = [...inputsOutsideWebsite()].sort();
  const skip = skipScriptInputs();
  const pages = pagesPushPaths();

  it("finds the build's inputs outside website/", () => {
    expect(derived).toEqual(
      expect.arrayContaining([
        "packages/vitest-native/src/docs-url.mjs",
        "packages/vitest-native/src/node-range.ts",
        "packages/vitest-native/src/peer-requirements.ts",
      ]),
    );
  });

  it("Vercel's skip script names every input, and nothing the build does not read", () => {
    for (const file of derived) expect(covers(skip, file), file).toBe(true);
    // Beyond the derived files: the site itself, its build config, and its dependencies.
    const declared = ["website", "vercel.json", "package.json", "bun.lock"];
    expect([...skip].sort()).toEqual([...declared, ...derived].sort());
  });

  it("GitHub Pages redeploys on a push to any of them", () => {
    for (const file of [...derived, "website/guide/install.md", "package.json", "bun.lock"]) {
      expect(covers(pages, file), file).toBe(true);
    }
  });

  it("names only files that exist", () => {
    for (const entry of [...skip, ...pages]) {
      expect(fs.existsSync(path.join(repoRoot, entry.replace(/\/\*\*$/, ""))), entry).toBe(true);
    }
  });
});

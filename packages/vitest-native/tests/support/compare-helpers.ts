/**
 * Shared by the `vitest-native compare` tests: scratch projects with this repository's
 * Vitest linked in, Jest reports written for them, and the CLI's main().
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../../src/cli/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The directory of an installed package, found from this repository. */
export function packageDir(name: string): string {
  for (let dir = here; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (path.dirname(dir) === dir) throw new Error(`${name} is not installed`);
  }
}

/** A scratch project (copied from `from`, plus `files`) with Vitest, and Jest when given, linked in. */
export function scratchProject(options: {
  from?: string;
  files?: Record<string, string>;
  jestDir?: string;
}): string {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-compare-e2e-"));
  if (options.from) fs.cpSync(options.from, root, { recursive: true });
  for (const [rel, content] of Object.entries(options.files ?? {})) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  if (!fs.existsSync(path.join(root, "package.json"))) {
    fs.writeFileSync(path.join(root, "package.json"), `{"name":"fx","private":true}\n`);
  }
  fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
  // A junction on Windows needs no privilege; elsewhere the type is ignored.
  fs.symlinkSync(packageDir("vitest"), path.join(root, "node_modules", "vitest"), "junction");
  if (options.jestDir)
    fs.symlinkSync(options.jestDir, path.join(root, "node_modules", "jest"), "junction");
  return root;
}

export interface JestTest {
  ancestors?: string[];
  title: string;
  status?: "passed" | "failed" | "pending";
}

/**
 * A Jest `--json` report for `root`, in the shape @jest/test-result 30 writes, saved
 * beside the project. `base` is the directory its file names start with (another
 * machine's checkout, for a report made in CI).
 */
export function jestReport(root: string, files: Record<string, JestTest[]>, base = root): string {
  const testResults = Object.entries(files).map(([rel, tests]) => ({
    name: path.join(base, rel),
    status: tests.some((t) => t.status === "failed") ? "failed" : "passed",
    message: "",
    assertionResults: tests.map((t) => ({
      ancestorTitles: t.ancestors ?? [],
      title: t.title,
      fullName: [...(t.ancestors ?? []), t.title].join(" "),
      status: t.status ?? "passed",
      failureMessages: t.status === "failed" ? ["Error: failed under Jest"] : [],
    })),
  }));
  const file = path.join(path.dirname(root), `${path.basename(root)}-jest.json`);
  fs.writeFileSync(file, JSON.stringify({ testResults }));
  return file;
}

/** Bytes of every file under the root except node_modules: what compare must not change. */
export function treeBytes(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(root, abs).split(path.sep).join("/")] = fs.readFileSync(abs, "utf8");
    }
  };
  walk(root);
  return out;
}

export async function runCli(args: string[]): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await main(["compare", ...args], (l) => lines.push(l));
  return { code, text: lines.join("\n") };
}

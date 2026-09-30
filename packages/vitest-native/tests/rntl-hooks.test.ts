import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { registerRntlHooksOnImport } from "../src/native/rntl-hooks.mjs";

// A stand-in RNTL whose entry counts its own evaluations — the side effect that, in
// the real package, registers the per-file hooks.
function fakeRntl(): { entry: string; pure: string; runs: () => number } {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-rntl-hooks-"));
  const dir = path.join(root, "node_modules", "@testing-library", "react-native", "build");
  fs.mkdirSync(dir, { recursive: true });
  const counter = `__vnRntlEntryRuns_${path.basename(root)}`;
  const entry = path.join(dir, "index.js");
  const pure = path.join(dir, "pure.js");
  fs.writeFileSync(
    entry,
    `globalThis[${JSON.stringify(counter)}] = (globalThis[${JSON.stringify(counter)}] ?? 0) + 1;\n`,
  );
  fs.writeFileSync(pure, "module.exports = {};\n");
  return {
    entry,
    pure,
    runs: () => ((globalThis as Record<string, unknown>)[counter] as number) ?? 0,
  };
}

// The evaluator's runExternalModule, reduced to what matters here: Node loads the file
// through its module cache, evaluating it only the first time.
function fakeEvaluator(): { runExternalModule: (id: string) => Promise<unknown> } {
  const req = createRequire(import.meta.url);
  return {
    runExternalModule: async (id: string) => req(id.startsWith("file://") ? fileURLToPath(id) : id),
  };
}

describe("RNTL hook registration for a resident RNTL", () => {
  it("re-runs the entry only when a file imports an entry that was already resident", async () => {
    const rntl = fakeRntl();
    const evaluator = fakeEvaluator();
    registerRntlHooksOnImport(evaluator);

    // First import: Node evaluates the entry, which registers its own hooks.
    await evaluator.runExternalModule(rntl.entry);
    expect(rntl.runs()).toBe(1);

    // A later file's import: the entry is resident and Node would not run it again,
    // so the wrapper does.
    await evaluator.runExternalModule(rntl.entry);
    expect(rntl.runs()).toBe(2);
    await evaluator.runExternalModule(`file://${rntl.entry}`);
    expect(rntl.runs()).toBe(3);
  });

  it("leaves other modules, including RNTL's hook-free `pure` entry, alone", async () => {
    const rntl = fakeRntl();
    const evaluator = fakeEvaluator();
    registerRntlHooksOnImport(evaluator);
    await evaluator.runExternalModule(rntl.pure);
    await evaluator.runExternalModule(rntl.pure);
    expect(rntl.runs()).toBe(0);
  });

  it("wraps an evaluator once, and tolerates one without runExternalModule", async () => {
    const rntl = fakeRntl();
    const evaluator = fakeEvaluator();
    registerRntlHooksOnImport(evaluator);
    registerRntlHooksOnImport(evaluator);
    await evaluator.runExternalModule(rntl.entry);
    await evaluator.runExternalModule(rntl.entry);
    expect(rntl.runs()).toBe(2);
    expect(() => registerRntlHooksOnImport({})).not.toThrow();
    expect(() => registerRntlHooksOnImport(undefined)).not.toThrow();
  });
});

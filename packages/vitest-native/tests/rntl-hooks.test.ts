import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { registerRntlHooksOnImport } from "../src/native/rntl-hooks.mjs";
import { installRntlAutoCleanup } from "../src/rntl-support.mjs";

// A stand-in RNTL whose entry counts its own evaluations — the side effect that, in
// the real package, registers the per-file hooks — and calls of its `cleanup`.
function fakeRntl(): { entry: string; pure: string; runs: () => number; cleanups: () => number } {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-rntl-hooks-"));
  const dir = path.join(root, "node_modules", "@testing-library", "react-native", "build");
  fs.mkdirSync(dir, { recursive: true });
  const counter = `__vnRntlEntryRuns_${path.basename(root)}`;
  const entry = path.join(dir, "index.js");
  const pure = path.join(dir, "pure.js");
  const cleanups = `${counter}_cleanups`;
  fs.writeFileSync(
    entry,
    `globalThis[${JSON.stringify(counter)}] = (globalThis[${JSON.stringify(counter)}] ?? 0) + 1;\n` +
      `exports.cleanup = () => { globalThis[${JSON.stringify(cleanups)}] = (globalThis[${JSON.stringify(cleanups)}] ?? 0) + 1; };\n`,
  );
  fs.writeFileSync(pure, "module.exports = {};\n");
  const read = (key: string) => ((globalThis as Record<string, unknown>)[key] as number) ?? 0;
  return { entry, pure, runs: () => read(counter), cleanups: () => read(cleanups) };
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

  it("recognises the entry through a symlinked path and a query-stamped URL", async () => {
    const rntl = fakeRntl();
    const evaluator = fakeEvaluator();
    registerRntlHooksOnImport(evaluator);
    await evaluator.runExternalModule(rntl.entry);
    expect(rntl.runs()).toBe(1);

    // Node caches the real path; an id reached through a symlinked node_modules is
    // matched by resolving it.
    const linkRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-rntl-link-"));
    const realPackage = path.dirname(path.dirname(rntl.entry));
    const linkedPackage = path.join(linkRoot, "node_modules", "@testing-library", "react-native");
    fs.mkdirSync(path.dirname(linkedPackage), { recursive: true });
    fs.symlinkSync(realPackage, linkedPackage, process.platform === "win32" ? "junction" : "dir");
    await evaluator.runExternalModule(path.join(linkedPackage, "build", "index.js"));
    expect(rntl.runs()).toBe(2);

    await evaluator.runExternalModule(`${pathToFileURL(rntl.entry).href}?v=1`);
    expect(rntl.runs()).toBe(3);
  });

  it("does not re-run an entry the evaluator stubs", async () => {
    const rntl = fakeRntl();
    const evaluator = fakeEvaluator();
    registerRntlHooksOnImport(evaluator);
    await evaluator.runExternalModule(rntl.entry);
    const stubbing = Object.assign(fakeEvaluator(), { stubs: { [rntl.entry]: {} } });
    registerRntlHooksOnImport(stubbing);
    await stubbing.runExternalModule.call(stubbing, rntl.entry);
    expect(rntl.runs()).toBe(1);
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

describe("RNTL auto-cleanup for a resident RNTL", () => {
  // installRntlAutoCleanup's hook, as one file's setup would register it.
  function setupFile(): () => Promise<void> {
    let hook: (() => Promise<void>) | undefined;
    installRntlAutoCleanup((fn) => (hook = fn), { trackImports: true });
    if (!hook) throw new Error("no afterEach hook was registered");
    return hook;
  }

  it("cleans up after a file only when that file imported the entry", async () => {
    const rntl = fakeRntl();
    const evaluator = fakeEvaluator();
    registerRntlHooksOnImport(evaluator);

    // First file: imports the entry, which Node evaluates.
    let afterEach = setupFile();
    await evaluator.runExternalModule(rntl.entry);
    await afterEach();
    expect(rntl.cleanups()).toBe(1);

    // Second file: the entry is resident in Node's module cache, but this file only
    // imports `pure`, RNTL's opt-out.
    afterEach = setupFile();
    await evaluator.runExternalModule(rntl.pure);
    await afterEach();
    expect(rntl.cleanups()).toBe(1);

    // Third file: imports the resident entry, which the wrapper re-runs.
    afterEach = setupFile();
    await evaluator.runExternalModule(rntl.entry);
    await afterEach();
    expect(rntl.cleanups()).toBe(2);
  });
});

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { threadId } from "node:worker_threads";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs, no types for the test import path
import { _setToolchainOptions, transformRN } from "../src/native/transform.mjs";

// Babel loads its presets and plugins with `require` during a transform. They must load
// as published, never through the engine's CommonJS hook (which recompiled
// @react-native/babel-preset's own hermes-parser plugins mid-transform, and "Reentrant
// preset detected" in #296), and never in the realm the tests' globals live in (see
// "Where Babel runs" in transform.mjs). Babel runs on a thread of its own: this pins it.
const cache = path.resolve(import.meta.dirname, "..", "node_modules", ".cache");
fs.mkdirSync(cache, { recursive: true });
const root = fs.mkdtempSync(path.join(cache, "vn-reentrancy-"));
afterAll(() => {
  _setToolchainOptions();
  fs.rmSync(root, { recursive: true, force: true });
});

// A thread that ends without a word is caught by the deadline. Shorter than the default
// minute, so a regression fails this file in seconds rather than hanging CI, and long
// enough for Babel's first load on a loaded machine.
const DEADLINE_MS = 30_000;
beforeEach(() => _setToolchainOptions({ deadlineMs: DEADLINE_MS }));

// A stand-in preset that reports where Babel evaluates it. @babel/core resolves from
// this package's node_modules by Node's ordinary upward lookup.
const presetDir = path.join(root, "node_modules", "@react-native", "babel-preset");
const report = path.join(root, "report.json");
fs.mkdirSync(presetDir, { recursive: true });
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "probe" }));
fs.writeFileSync(
  path.join(presetDir, "package.json"),
  JSON.stringify({ name: "@react-native/babel-preset", version: "0.0.0-probe", main: "index.js" }),
);
fs.writeFileSync(
  path.join(presetDir, "index.js"),
  `module.exports = (api) => {
    require("node:fs").writeFileSync(${JSON.stringify(report)}, JSON.stringify({
      threadId: require("node:worker_threads").threadId,
      sawTestGlobal: "__vnProbe" in globalThis,
    }));
    // A preset that ends its thread, as a crash in Babel would.
    if (api.caller((c) => c && c.platform) === "end-thread") process.exit(3);
    // Or runs out of heap, which runs no exit handler.
    if (api.caller((c) => c && c.platform) === "out-of-memory") {
      const hold = [];
      for (;;) hold.push(new Array(1e5).fill({}));
    }
    // Or stops answering, still running (a heartbeat shows whether it was stopped).
    if (api.caller((c) => c && c.platform) === "busy") {
      for (;;) require("node:fs").writeFileSync(${JSON.stringify(path.join(root, "beat"))}, String(Date.now()));
    }
    // Or after it has answered, while idle.
    if (api.caller((c) => c && c.platform) === "end-thread-later") setTimeout(() => process.exit(4), 0);
    return { plugins: [] };
  };\n`,
);
(globalThis as Record<string, unknown>).__vnProbe = true;

it("loads the preset on Babel's own thread, outside the tests' realm", () => {
  const file = path.join(root, "plain.js");
  fs.writeFileSync(file, "const a = 1;\n");
  transformRN(file, "const a = 1;\n", root);
  const seen = JSON.parse(fs.readFileSync(report, "utf8"));
  expect(seen.threadId).not.toBe(threadId);
  expect(seen.sawTestGlobal).toBe(false);
});

it("reports Babel's error, and compiles the next file", () => {
  const file = path.join(root, "broken.js");
  fs.writeFileSync(file, "const = ;\n");
  expect(() => transformRN(file, "const = ;\n", root)).toThrow(
    /Failed to transform[\s\S]*broken\.js[\s\S]*Unexpected token/,
  );
  const next = path.join(root, "next.js");
  fs.writeFileSync(next, "const b = 2;\n");
  expect(transformRN(next, "const b = 2;\n", root)).toContain("b = 2");
});

it("reports a Babel thread that ended without answering, and starts another", () => {
  const file = path.join(root, "ends.js");
  fs.writeFileSync(file, "const c = 3;\n");
  expect(() => transformRN(file, "const c = 3;\n", root, "end-thread")).toThrow(
    /ends\.js[\s\S]*Babel's thread ended before it answered: something it ran ended it/,
  );
  const next = path.join(root, "after.js");
  fs.writeFileSync(next, "const d = 4;\n");
  expect(transformRN(next, "const d = 4;\n", root)).toContain("d = 4");
});

it("starts another Babel thread when the last one ended while idle", async () => {
  const file = path.join(root, "later.js");
  fs.writeFileSync(file, "const e = 5;\n");
  expect(transformRN(file, "const e = 5;\n", root, "end-thread-later")).toContain("e = 5");
  // Let the idle thread end.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const next = path.join(root, "afterIdle.js");
  fs.writeFileSync(next, "const f = 6;\n");
  expect(transformRN(next, "const f = 6;\n", root)).toContain("f = 6");
});

/**
 * A Babel thread that dies or stops answering, driven in a child process: if that ever
 * leaves the caller waiting, or raises an error nothing handles, the child is what hangs
 * or crashes, and the spawn timeout turns it into this file's failure, not a stuck run.
 */
function inChild(body: string): { result: Record<string, unknown>; stderr: string } {
  const transformUrl = pathToFileURL(path.join(import.meta.dirname, "../src/native/transform.mjs"));
  const script =
    `import { _setToolchainOptions, transformRN } from ${JSON.stringify(transformUrl.href)};\n` +
    `import fs from "node:fs";\n` +
    `const root = ${JSON.stringify(root)};\n` +
    `const attempt = (name, platform) => {\n` +
    `  const file = root + "/" + name; fs.writeFileSync(file, "const x = 1;\\n");\n` +
    `  const started = performance.now();\n` +
    `  try { transformRN(file, undefined, root, platform); return { ok: true }; }\n` +
    `  catch (err) { return { code: err.code, message: err.message, ms: performance.now() - started }; }\n` +
    `};\n` +
    `const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));\n` +
    body;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 60_000,
  });
  const line = child.stdout.split("\n").find((l) => l.startsWith("RESULT="));
  if (!line) {
    throw new Error(
      `the child gave no result (status ${child.status}, signal ${child.signal}):\n${child.stderr}`,
    );
  }
  return { result: JSON.parse(line.slice("RESULT=".length)), stderr: child.stderr };
}

it("reports a Babel thread that ran out of heap, promptly, and starts another", () => {
  const { result, stderr } = inChild(`
    _setToolchainOptions({ deadlineMs: 15_000, resourceLimits: { maxOldGenerationSizeMb: 64 } });
    const lost = attempt("oom.js", "out-of-memory");
    _setToolchainOptions({ deadlineMs: 30_000 });
    const next = attempt("afterOom.js");
    // The thread's own error arrives as an event, after the caller has failed.
    await settle(500);
    console.log("RESULT=" + JSON.stringify({ lost, next }));
  `);
  const lost = result.lost as { code: string; message: string; ms: number };
  expect(lost.code).toBe("TRANSFORM_FAILED");
  expect(lost.message).toMatch(/oom\.js[\s\S]*has not answered in 15 s[\s\S]*out of memory/);
  expect(lost.message).not.toMatch(/could not parse/);
  expect(lost.ms).toBeLessThan(15_000 + 5_000);
  expect(result.next).toEqual({ ok: true });
  expect(stderr).toMatch(/Babel's thread: .*out of memory/);
}, 120_000);

it("reports a Babel thread that failed to load, promptly", () => {
  // A worker that throws before it can say so: only the deadline ends the wait.
  const broken = path.join(root, "broken-worker.mjs");
  fs.writeFileSync(broken, 'throw new Error("failed to load");\n');
  const { result, stderr } = inChild(`
    _setToolchainOptions({ deadlineMs: 2_000, workerUrl: new URL(${JSON.stringify(pathToFileURL(broken).href)}) });
    const lost = attempt("unloaded.js");
    await settle(500);
    console.log("RESULT=" + JSON.stringify({ lost }));
  `);
  const lost = result.lost as { code: string; message: string; ms: number };
  expect(lost.code).toBe("TRANSFORM_FAILED");
  expect(lost.message).toMatch(/has not answered in 2 s/);
  expect(lost.ms).toBeLessThan(2_000 + 3_000);
  expect(stderr).toMatch(/Babel's thread: Error: failed to load/);
}, 120_000);

it("stops a Babel thread that has not answered by the deadline", () => {
  const beat = path.join(root, "beat");
  const { result } = inChild(`
    _setToolchainOptions({ deadlineMs: 3_000 });
    const lost = attempt("busy.js", "busy");
    await settle(1_000);
    const first = fs.readFileSync(${JSON.stringify(beat)}, "utf8");
    await settle(1_000);
    const second = fs.readFileSync(${JSON.stringify(beat)}, "utf8");
    console.log("RESULT=" + JSON.stringify({ code: lost.code, stopped: first === second }));
  `);
  expect(result).toEqual({ code: "TRANSFORM_FAILED", stopped: true });
}, 120_000);

it("compiles while a test has stubbed what the call to Babel's thread uses", () => {
  // The call runs with test code on the stack: what it uses was captured as it loaded.
  vi.stubGlobal("Atomics", {});
  vi.stubGlobal("SharedArrayBuffer", undefined);
  vi.stubGlobal("Int32Array", undefined);
  vi.useFakeTimers({ toFake: ["performance", "Date"] });
  try {
    // A fresh thread, so starting one is covered too.
    _setToolchainOptions({ deadlineMs: DEADLINE_MS });
    const file = path.join(root, "stubbed.js");
    fs.writeFileSync(file, "const j = 10;\n");
    expect(transformRN(file, "const j = 10;\n", root)).toContain("j = 10");
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
}, 60_000);

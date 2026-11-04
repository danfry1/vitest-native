import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { threadId } from "node:worker_threads";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs, no types for the test import path
import {
  _setToolchainOptions,
  toolchainDeadlineMs,
  transformRN,
} from "../src/native/transform.mjs";

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
// enough for Babel's first load on a loaded machine. No test below passes by beating it:
// each thread here answers, or says it ended, and the deadline only bounds a regression.
const DEADLINE_MS = 30_000;
beforeEach(() => _setToolchainOptions({ deadlineMs: DEADLINE_MS }));

// A stand-in preset that reports where Babel evaluates it. @babel/core resolves from
// this package's node_modules by Node's ordinary upward lookup. Each way of failing
// leaves a file behind (named after it) once it has started, so the tests can order
// the deadline after it rather than race it.
const presetDir = path.join(root, "node_modules", "@react-native", "babel-preset");
const report = path.join(root, "report.json");
const marker = (name: string) => path.join(root, `${name}.marker`);
fs.mkdirSync(presetDir, { recursive: true });
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "probe" }));
fs.writeFileSync(
  path.join(presetDir, "package.json"),
  JSON.stringify({ name: "@react-native/babel-preset", version: "0.0.0-probe", main: "index.js" }),
);
fs.writeFileSync(
  path.join(presetDir, "index.js"),
  `const fs = require("node:fs");
  const marker = (name) => ${JSON.stringify(root)} + "/" + name + ".marker";
  module.exports = (api) => {
    fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify({
      threadId: require("node:worker_threads").threadId,
      sawTestGlobal: "__vnProbe" in globalThis,
    }));
    const platform = api.caller((c) => c && c.platform);
    // A preset that ends its thread, as a crash in Babel would.
    if (platform === "end-thread") process.exit(3);
    // Or runs out of heap, which runs no exit handler. The count of what it holds shows
    // when it has stopped.
    if (platform === "out-of-memory") {
      const hold = [];
      for (let n = 1; ; n++) {
        hold.push(new Array(1e5).fill({}));
        fs.writeFileSync(marker("out-of-memory"), String(n));
      }
    }
    // Or stops answering, still running (a count shows whether it was stopped).
    if (platform === "busy") {
      for (let n = 1; ; n++) fs.writeFileSync(marker("busy"), String(n));
    }
    // Or takes its time, as a very large file on a busy machine does: it answers once
    // the caller lets it go (see slowClock).
    if (platform === "slow") {
      while (!fs.existsSync(marker("release"))) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    // Or after it has answered, while idle. Listeners run in the order they were added,
    // so the marker is written after babel-worker.mjs has said the thread ended.
    if (platform === "end-thread-later") {
      process.on("exit", () => fs.writeFileSync(marker("end-thread-later"), ""));
      setTimeout(() => process.exit(4), 0);
    }
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
  // Wait for the idle thread to have ended, as it says once it has.
  while (!fs.existsSync(marker("end-thread-later"))) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const next = path.join(root, "afterIdle.js");
  fs.writeFileSync(next, "const f = 6;\n");
  expect(transformRN(next, "const f = 6;\n", root)).toContain("f = 6");
});

// How long a child below may run before it counts as hung. Nothing below waits on it:
// each deadline is driven by the clock the child installs (see inChild), so this only
// turns a regression that leaves the caller waiting into a failure. The test's own
// timeout cannot, as spawnSync holds this thread's event loop.
const HUNG_MS = 120_000;

/**
 * A Babel thread that dies or stops answering, driven in a child process: if that ever
 * leaves the caller waiting, or raises an error nothing handles, the child is what hangs
 * or crashes, and the spawn timeout turns it into this file's failure, not a stuck run.
 *
 * The deadline runs on a clock the child installs (`now` in _setToolchainOptions), read
 * once as a request is sent and then between waits of at most a second. `never()` stands
 * still, so only the thread can end the wait. `after(ready)` stands still until
 * `ready()` has held on one read, then passes any deadline on the next, so the deadline
 * comes after what `ready` waits for, however long the machine took to get there.
 * `printed` settles once the thread's own account ("Babel's thread: …") is written.
 */
function inChild(body: string): { result: Record<string, unknown>; stderr: string } {
  const transformUrl = pathToFileURL(path.join(import.meta.dirname, "../src/native/transform.mjs"));
  const script =
    `import { _setToolchainOptions, transformRN } from ${JSON.stringify(transformUrl.href)};\n` +
    `import fs from "node:fs";\n` +
    `import path from "node:path";\n` +
    `const root = ${JSON.stringify(root)};\n` +
    `const marker = (name) => root + "/" + name + ".marker";\n` +
    `const attempt = (name, platform, source = "const x = 1;\\n") => {\n` +
    `  const file = path.join(root, name);\n` +
    `  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source);\n` +
    `  try { transformRN(file, undefined, root, platform); return { ok: true }; }\n` +
    `  catch (err) { return { code: err.code, message: err.message }; }\n` +
    `};\n` +
    `const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));\n` +
    `const never = () => () => 0;\n` +
    `const after = (ready) => { let seen = false; return () => { if (seen) return 1e15; seen = ready(); return 0; }; };\n` +
    `const printed = new Promise((resolve) => {\n` +
    `  const write = process.stderr.write.bind(process.stderr);\n` +
    `  process.stderr.write = (chunk, ...rest) => {\n` +
    `    if (String(chunk).includes("Babel's thread: ")) resolve();\n` +
    `    return write(chunk, ...rest);\n` +
    `  };\n` +
    `});\n` +
    body;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: HUNG_MS,
  });
  const line = child.stdout.split("\n").find((l) => l.startsWith("RESULT="));
  if (!line) {
    throw new Error(
      `the child gave no result (status ${child.status}, signal ${child.signal}):\n${child.stderr}`,
    );
  }
  return { result: JSON.parse(line.slice("RESULT=".length)), stderr: child.stderr };
}

it("reports a Babel thread that ran out of heap, by the deadline, and starts another", () => {
  const { result, stderr } = inChild(`
    // The heap is gone once what the preset holds has stopped growing across three
    // reads (a second's wait apart); the deadline passes on the read after.
    let last = 0, still = 0;
    const outOfHeap = () => {
      const held = Number(fs.existsSync(marker("out-of-memory")) && fs.readFileSync(marker("out-of-memory"), "utf8"));
      still = held > 0 && held === last ? still + 1 : 0;
      last = held;
      return still >= 3;
    };
    _setToolchainOptions({ deadlineMs: 5_000, now: after(outOfHeap), resourceLimits: { maxOldGenerationSizeMb: 64 } });
    const lost = attempt("oom.js", "out-of-memory");
    _setToolchainOptions({ deadlineMs: 5_000, now: never() });
    const next = attempt("afterOom.js");
    // The thread's own error arrives as an event, after the caller has failed.
    await printed;
    console.log("RESULT=" + JSON.stringify({ lost, next }));
  `);
  const lost = result.lost as { code: string; message: string };
  expect(lost.code).toBe("TRANSFORM_FAILED");
  expect(lost.message).toMatch(
    /oom\.js[\s\S]*has not answered in 5 s compiling 0\.0 MB of source[\s\S]*out of memory[\s\S]*--max-old-space-size/,
  );
  expect(lost.message).not.toMatch(/could not parse/);
  expect(result.next).toEqual({ ok: true });
  expect(stderr).toMatch(/Babel's thread: .*out of memory/);
}, 180_000);

it("reports Babel's thread failing to load Babel's side, without waiting for the deadline", () => {
  // The real worker beside a babel-toolchain.mjs that throws as it loads: the exit
  // handler the worker registers first says so. The clock stands still, so the deadline
  // never comes and only that handler can end the wait.
  const dir = path.join(root, "real-worker");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(
    path.join(import.meta.dirname, "../src/native/babel-worker.mjs"),
    path.join(dir, "babel-worker.mjs"),
  );
  fs.writeFileSync(
    path.join(dir, "babel-toolchain.mjs"),
    'throw new Error("toolchain failed to load");\n',
  );
  const workerUrl = pathToFileURL(path.join(dir, "babel-worker.mjs")).href;
  const { result, stderr } = inChild(`
    _setToolchainOptions({ deadlineMs: 5_000, now: never(), workerUrl: new URL(${JSON.stringify(workerUrl)}) });
    const lost = attempt("toolchainUnloaded.js");
    await printed;
    console.log("RESULT=" + JSON.stringify({ lost }));
  `);
  const lost = result.lost as { code: string; message: string };
  expect(lost.code).toBe("TRANSFORM_FAILED");
  expect(lost.message).toMatch(/Babel's thread ended before it answered/);
  expect(stderr).toMatch(/Babel's thread: Error: toolchain failed to load/);
}, 180_000);

it("reports a Babel thread that failed to load without a word, by the deadline", () => {
  // A worker that throws before it can say so: only the deadline ends the wait. It
  // passes once the worker has started throwing.
  const broken = path.join(root, "broken-worker.mjs");
  fs.writeFileSync(
    broken,
    `import fs from "node:fs";\n` +
      `fs.writeFileSync(${JSON.stringify(marker("broken-worker"))}, "");\n` +
      `throw new Error("failed to load");\n`,
  );
  const { result, stderr } = inChild(`
    _setToolchainOptions({ deadlineMs: 2_000, now: after(() => fs.existsSync(marker("broken-worker"))), workerUrl: new URL(${JSON.stringify(pathToFileURL(broken).href)}) });
    const lost = attempt("unloaded.js");
    await printed;
    console.log("RESULT=" + JSON.stringify({ lost }));
  `);
  const lost = result.lost as { code: string; message: string };
  expect(lost.code).toBe("TRANSFORM_FAILED");
  expect(lost.message).toMatch(/has not answered in 2 s/);
  expect(stderr).toMatch(/Babel's thread: Error: failed to load/);
}, 180_000);

it("stops a Babel thread that has not answered by the deadline", () => {
  const { result } = inChild(`
    // The deadline passes once the preset is running.
    _setToolchainOptions({ deadlineMs: 3_000, now: after(() => fs.existsSync(marker("busy"))) });
    const lost = attempt("busy.js", "busy");
    // Stopped: the preset's count holds across three reads. A thread left running
    // never gets there, and the child hangs.
    const count = () => fs.readFileSync(marker("busy"), "utf8");
    let last = count(), still = 0;
    while (still < 3) {
      await settle(200);
      const now = count();
      still = now === last ? still + 1 : 0;
      last = now;
    }
    console.log("RESULT=" + JSON.stringify(lost));
  `);
  expect(result.code).toBe("TRANSFORM_FAILED");
  expect(result.message).toMatch(/busy\.js[\s\S]*has not answered in 3 s compiling 0\.0 MB/);
}, 180_000);

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

it("gives a transform more time the more source it carries", () => {
  // A config lookup carries none: the base minute.
  expect(toolchainDeadlineMs({ kind: "config" })).toBe(60_000);
  expect(toolchainDeadlineMs({ kind: "transform", src: "" })).toBe(60_000);
  // 15 s for each MB on top: TypeScript's own 9.1 MB typescript.js gets 197 s.
  const mb = 1024 * 1024;
  expect(toolchainDeadlineMs({ kind: "transform", src: "x".repeat(mb) })).toBe(75_000);
  expect(toolchainDeadlineMs({ kind: "transform", src: "x".repeat(9.14 * mb) })).toBe(197_100);
  expect(toolchainDeadlineMs({ kind: "transform", src: "x".repeat(mb) }, 1_000)).toBe(16_000);
});

it("lets a transform of more source run past the base deadline", () => {
  // Each takes 2.5 s on the clock against a 1 s base: the small file runs out of time,
  // and the 0.25 MB one, given 1 s + 3.75 s, compiles. The clock reads 0 as the request
  // is sent and 2.5 s from then on; the preset is let go only on a read after a wait at
  // 2.5 s, which a caller whose deadline has passed never makes. The files sit under
  // node_modules, so no project-config lookup reads the clock first.
  const { result } = inChild(`
    const slowClock = () => {
      let reads = 0;
      return () => {
        reads++;
        if (reads === 1) return 0;
        if (reads >= 3) fs.writeFileSync(marker("release"), "");
        return 2_500;
      };
    };
    _setToolchainOptions({ deadlineMs: 1_000, now: slowClock() });
    const small = attempt("node_modules/slow/small.js", "slow");
    _setToolchainOptions({ deadlineMs: 1_000, now: slowClock() });
    const large = attempt("node_modules/slow/large.js", "slow", "// " + "x".repeat(256 * 1024) + "\\nconst y = 2;\\n");
    console.log("RESULT=" + JSON.stringify({ small, large }));
  `);
  const { small, large } = result as Record<string, { code?: string; message?: string }>;
  expect(small.code).toBe("TRANSFORM_FAILED");
  expect(small.message).toMatch(/small\.js[\s\S]*has not answered in 1 s/);
  expect(large).toEqual({ ok: true });
}, 180_000);

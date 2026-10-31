import fs from "node:fs";
import path from "node:path";
import { threadId } from "node:worker_threads";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types for the test import path
import { transformRN } from "../src/native/transform.mjs";

// Babel loads its presets and plugins with `require` during a transform. They must load
// as published, never through the engine's CommonJS hook (which recompiled
// @react-native/babel-preset's own hermes-parser plugins mid-transform, and "Reentrant
// preset detected" in #296), and never in the realm the tests' globals live in (see
// "Where Babel runs" in transform.mjs). Babel runs on a thread of its own: this pins it.
const cache = path.resolve(import.meta.dirname, "..", "node_modules", ".cache");
fs.mkdirSync(cache, { recursive: true });
const root = fs.mkdtempSync(path.join(cache, "vn-reentrancy-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

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
    /Babel's thread ended before it answered/,
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

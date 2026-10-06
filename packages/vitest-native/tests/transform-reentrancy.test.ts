import fs from "node:fs";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types for the test import path
import { isTransforming, transformRN } from "../src/native/transform.mjs";

// Babel loads its presets and plugins with `require` during a transform. The engine's
// CommonJS hook must not compile those (hooks.mjs consults isTransforming): doing so
// recompiled @react-native/babel-preset's own hermes-parser plugins mid-transform and
// Node warned about reading a half-loaded module's exports. This pins the signal the
// hook relies on: true exactly while Babel runs, and reset when Babel throws.
const cache = path.resolve(import.meta.dirname, "..", "node_modules", ".cache");
fs.mkdirSync(cache, { recursive: true });
const root = fs.mkdtempSync(path.join(cache, "vn-reentrancy-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

// A stand-in preset that reports what it sees while Babel evaluates it. @babel/core
// resolves from this package's node_modules by Node's ordinary upward lookup.
const presetDir = path.join(root, "node_modules", "@react-native", "babel-preset");
fs.mkdirSync(presetDir, { recursive: true });
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "probe" }));
fs.writeFileSync(
  path.join(presetDir, "package.json"),
  JSON.stringify({ name: "@react-native/babel-preset", version: "0.0.0-probe", main: "index.js" }),
);
fs.writeFileSync(
  path.join(presetDir, "index.js"),
  "module.exports = () => { globalThis.__vnSeenDuringPreset = globalThis.__vnProbe(); return { plugins: [] }; };\n",
);
(globalThis as Record<string, unknown>).__vnProbe = () => isTransforming();

it("reports a transform in progress to code Babel loads, and none outside one", () => {
  expect(isTransforming()).toBe(false);
  const file = path.join(root, "plain.js");
  fs.writeFileSync(file, "const a = 1;\n");
  transformRN(file, "const a = 1;\n", root);
  expect((globalThis as Record<string, unknown>).__vnSeenDuringPreset).toBe(true);
  expect(isTransforming()).toBe(false);
});

it("resets when Babel throws", () => {
  const file = path.join(root, "broken.js");
  fs.writeFileSync(file, "const = ;\n");
  expect(() => transformRN(file, "const = ;\n", root)).toThrow();
  expect(isTransforming()).toBe(false);
});

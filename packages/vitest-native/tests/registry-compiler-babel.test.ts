/**
 * The registry compiler's child runs Babel on its own thread (transform.mjs, "Where
 * Babel runs"): no test code runs there, and its heap bound must cover Babel. Running
 * out of that heap is then the child's own "heap out of memory" exit, which
 * bounded-process.mjs retries with more heap. On Babel's separate thread it would be
 * that thread's silent death instead, found only by the transform deadline.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types for the test import path
import { compileRegistryInChild } from "../src/native/registry-process.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const compilerFile = path.join(packageRoot, "src/native/registry-compiler.mjs");

// A fresh project, so both the registry and the transform cache are cold.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-babel-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app", private: true }));
for (const name of ["@babel/core", "@react-native/babel-preset", "react", "react-native"]) {
  const destination = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.symlinkSync(path.dirname(require.resolve(`${name}/package.json`)), destination, "dir");
}

it("runs out of the child's own heap when Babel does not fit, so it can be retried", async () => {
  const started = performance.now();
  const result = await compileRegistryInChild(
    compilerFile,
    {
      projectRoot: root,
      platform: "ios",
      reactNativeVersion: require("react-native/package.json").version,
      assetExts: ["png", "jpg"],
      diagnostics: false,
    },
    // Too small for Babel, at both attempts.
    { initialHeapMb: 16, retryHeapMb: 16, timeoutMs: 40_000 },
  );
  expect(result).toMatchObject({ ok: false, oom: true });
  expect(performance.now() - started).toBeLessThan(40_000);
}, 120_000);

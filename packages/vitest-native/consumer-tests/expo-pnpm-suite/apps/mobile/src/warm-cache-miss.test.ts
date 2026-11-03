/**
 * A transform-cache miss after the engine has installed Expo's runtime. The runner runs
 * this suite twice; on the second, warm run this file's fresh module is the worker's
 * first cache miss, so Babel loads after setup, with Expo's lazy globals in place. A
 * lazy global read while Babel loads must not compile a file with a half-loaded Babel.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);

it("compiles a fresh Expo-owned module on a warm cache", () => {
  const dir = path.join(path.dirname(require.resolve("expo/package.json")), "src");
  const file = path.join(dir, `fresh-${crypto.randomUUID()}.ts`);
  fs.writeFileSync(file, "export class Fresh {\n  answer: number = 42;\n}\n");
  try {
    const { Fresh } = require(file) as { Fresh: new () => { answer: number } };
    expect(new Fresh().answer).toBe(42);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

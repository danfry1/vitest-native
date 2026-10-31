import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);

// A module no cache has seen, in a package Node cannot run as published. On a warm run
// it is this worker's first cache miss: the first time it needs Babel, after the
// engine's setup installed Expo's runtime.
it("compiles a cache miss after Expo's runtime is installed", () => {
  const dir = path.join(path.dirname(require.resolve("expo/package.json")), "src");
  const file = path.join(dir, `fresh-${crypto.randomUUID()}.ts`);
  fs.writeFileSync(file, "export class Fresh {\n  answer: number = 42;\n}\n");
  let error: unknown = null;
  let loaded: { Fresh?: new () => { answer: number } } = {};
  try {
    loaded = require(file);
  } catch (err) {
    error = err;
  }
  const message = String((error as Error | null)?.message ?? "");
  expect(
    /reading '(environmentVisitor|visitors)'/.test(message),
    "Babel compiled a file while it was still loading",
  ).toBe(false);
  expect(message).toBe("");
  expect(new loaded.Fresh!().answer).toBe(42);
});

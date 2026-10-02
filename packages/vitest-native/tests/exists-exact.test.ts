import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types for the test import path
import { existsExact } from "../src/native/resolve.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-exists-exact-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

// A case-insensitive disk (macOS, Windows) reports App.json as present when only
// app.json is; the directory listing does not.
it("matches a file name exactly, whatever the disk's case sensitivity", () => {
  fs.writeFileSync(path.join(root, "app.json"), "{}");
  expect(existsExact(path.join(root, "app.json"))).toBe(true);
  expect(existsExact(path.join(root, "App.json"))).toBe(false);
  expect(existsExact(path.join(root, "missing.json"))).toBe(false);
});

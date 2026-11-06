import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { threadId } from "node:worker_threads";
import { expect, vi } from "vitest";

// Shared by 19/20: two files in one hot worker that both load an expo-modules-core
// from SDK 54 or older. Each file's output carries the warning (hooks.mjs clears what
// it warned about at the per-file reset), and the copy's package.json is not read again
// by whichever file runs second.
const store = path.join(os.tmpdir(), "vn-expo-sdk-warning-pair");
const core = path.join(store, "node_modules", "expo-modules-core");
const manifest = path.join(core, "package.json");
const marker = path.join(os.tmpdir(), "vn-expo-sdk-warning-pair.first");

/** The worker that ran first, or null when this file is first (see resolution-memo.ts). */
function claimFirst(): string | null {
  try {
    fs.writeFileSync(marker, String(threadId), { flag: "wx" });
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return fs.readFileSync(marker, "utf8");
  }
}

export function loadOldExpoModulesCore() {
  const previous = claimFirst();
  if (previous === null) {
    fs.mkdirSync(path.join(core, "build"), { recursive: true });
    fs.writeFileSync(
      manifest,
      JSON.stringify({ name: "expo-modules-core", version: "3.0.29", main: "build/index.js" }),
    );
    fs.writeFileSync(path.join(core, "build", "index.js"), "module.exports = {};");
  }
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const read = vi.spyOn(fs, "readFileSync");
  let warnings: string[];
  let manifestReads: number;
  try {
    createRequire(path.join(store, "index.js"))("expo-modules-core");
    // Counted before mockRestore, which clears the recorded calls.
    warnings = warn.mock.calls.map((call) => String(call[0])).filter((l) => l.includes("Expo SDK"));
    manifestReads = read.mock.calls.filter(([file]) => String(file) === manifest).length;
  } finally {
    warn.mockRestore();
    read.mockRestore();
  }

  expect(warnings, "this file's output names the copy").toEqual([
    expect.stringContaining(`expo-modules-core 3.0.29 (${core}) is from Expo SDK 54 or older`),
  ]);
  if (previous === null) {
    // Node's resolution of the package reads its manifest too; the version read is
    // asserted exactly in tests/expo-sdk-loaded.test.ts.
    expect(manifestReads, "the first file reads the manifest").toBeGreaterThan(0);
    return;
  }
  fs.rmSync(marker, { force: true });
  expect(previous, "both files of the pair ran in one worker").toBe(String(threadId));
  expect(manifestReads, "the next file reads the manifest no more").toBe(0);
}

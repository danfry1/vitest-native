import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RESIDENT_GLOBALS, isResidentGlobal } from "../src/native/resident-globals.mjs";

// vitest-native's resident modules create their worker-lifetime globals through one
// declared list, which the hot reset keeps (#792). A module that created its own with
// `globalThis[Symbol.for("vitest-native.…")] ??=` would be deleted after the worker's
// first file while the module kept counting into the deleted object.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
// The asset registry's id map is keyed by React Native's per-file registry object, so it
// is per-file state: the reset may delete it, and the next file's assets start again.
const PER_FILE = new Set(["vitest-native.asset-ids"]);

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(?:m?js|ts|mts)$/.test(entry.name) ? [full] : [];
  });
}

describe("worker-lifetime globals", () => {
  it("are created through RESIDENT_GLOBALS, not a Symbol.for of their own", () => {
    const LAZY =
      /globalThis\[Symbol\.for\(["'`](vitest-native\.[^"'`]+)["'`]\)\]\s*(?:\?\?|\|\|)=/g;
    const found = files(src)
      .flatMap((file) =>
        [...fs.readFileSync(file, "utf8").matchAll(LAZY)].map(
          (match) => `${path.relative(src, file)}: ${match[1]}`,
        ),
      )
      .filter((site) => !PER_FILE.has(site.split(": ")[1]));
    expect(found).toEqual([]);
  });

  it("are the keys the reset keeps", () => {
    for (const key of Object.values(RESIDENT_GLOBALS)) expect(isResidentGlobal(key)).toBe(true);
    expect(isResidentGlobal(Symbol.for("vitest-native.asset-ids"))).toBe(false);
    expect(isResidentGlobal("__vitest_native_preset_mocks")).toBe(false);
  });
});

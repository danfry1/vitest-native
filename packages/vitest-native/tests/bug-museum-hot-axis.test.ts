/**
 * The bug museum's --hot axis (validation/bug-museum/lib/materialise.mjs wrapForHot): every
 * exhibit runs with hotRuntime false, or 'auto', whatever its config pins; under 'auto' an
 * exhibit written for the hot runtime keeps its own.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { HOT_MARKER, wrapForHot } from "../validation/bug-museum/lib/materialise.mjs";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** An installed copy whose reactNative() returns the options it was given. */
async function wrapped(mode: "off" | "auto") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-museum-hot-axis-"));
  dirs.push(root);
  const installed = path.join(root, "node_modules", "vitest-native");
  fs.mkdirSync(installed, { recursive: true });
  fs.writeFileSync(path.join(installed, "index.mjs"), "export const reactNative = (o) => o;\n");
  fs.writeFileSync(
    path.join(installed, "package.json"),
    JSON.stringify({
      name: "vitest-native",
      type: "module",
      exports: { ".": { default: "./index.mjs" } },
    }),
  );
  wrapForHot(installed, root, mode);
  const entry = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8")).exports[
    "."
  ].default;
  const module = await import(pathToFileURL(path.join(installed, entry)).href);
  const marker = () =>
    fs.readFileSync(path.join(root, HOT_MARKER), "utf8").split("\n").filter(Boolean);
  return { reactNative: module.reactNative as (o?: object) => { hotRuntime?: unknown }, marker };
}

describe("--hot off", () => {
  it("runs every exhibit per file, whatever it pins", async () => {
    const { reactNative, marker } = await wrapped("off");
    for (const hotRuntime of [undefined, false, true, "auto", { allowUnboundedMemory: true }]) {
      expect(reactNative({ hotRuntime }).hotRuntime).toBe(false);
    }
    // The last three asked for the hot runtime: their exhibits' precondition is gone.
    expect(marker()).toEqual(["axis", "axis", "overrode", "overrode", "overrode"]);
  });
});

describe("--hot auto", () => {
  it("gives 'auto' to an exhibit that pins false or leaves it unset", async () => {
    const { reactNative, marker } = await wrapped("auto");
    expect(reactNative({}).hotRuntime).toBe("auto");
    expect(reactNative({ hotRuntime: false }).hotRuntime).toBe("auto");
    expect(marker()).toEqual(["axis", "axis"]);
  });

  it("keeps the hot runtime an exhibit asks for", async () => {
    const { reactNative, marker } = await wrapped("auto");
    const own = { allowUnboundedMemory: true };
    expect(reactNative({ hotRuntime: true }).hotRuntime).toBe(true);
    expect(reactNative({ hotRuntime: own }).hotRuntime).toBe(own);
    expect(reactNative({ hotRuntime: "auto" }).hotRuntime).toBe("auto");
    expect(marker()).toEqual(["exhibit", "exhibit", "exhibit"]);
  });
});

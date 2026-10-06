import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";
import { presetForInstalled } from "../src/preset-map.js";

// A package whose own JS switches to an in-memory implementation under Vitest keeps
// its real API; its preset steps aside from that major on.
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function projectWith(packages: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-self-testing-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  for (const [name, version] of Object.entries(packages)) {
    const dir = path.join(root, "node_modules", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name, version, main: "index.js" }),
    );
    fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};");
  }
  return createRequire(path.join(root, "package.json"));
}

describe("presetForInstalled", () => {
  it("keeps the mmkv preset before v3, which had no Vitest check", () => {
    expect(
      presetForInstalled("react-native-mmkv", projectWith({ "react-native-mmkv": "2.12.2" })),
    ).toBe("mmkv");
  });

  it("lets mmkv 3 and 4 test themselves", () => {
    expect(
      presetForInstalled("react-native-mmkv", projectWith({ "react-native-mmkv": "3.3.3" })),
    ).toBeNull();
    expect(
      presetForInstalled("react-native-mmkv", projectWith({ "react-native-mmkv": "4.3.2" })),
    ).toBeNull();
  });

  it("returns null for a package that is not installed", () => {
    expect(presetForInstalled("react-native-mmkv", projectWith({}))).toBeNull();
  });

  it("is unaffected for packages without a self-testing major", () => {
    const req = projectWith({ "react-native-svg": "15.0.0" });
    expect(presetForInstalled("react-native-svg", req)).toBe("svg");
  });
});

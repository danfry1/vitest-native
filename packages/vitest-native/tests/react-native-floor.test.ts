/**
 * The React Native releases the native engine supports, and what an older one is told.
 *
 * The range is the rows of the CI matrix (.github/rn-matrix.json). Below its floor the
 * native engine has no code path, so the plugin stops with UNSUPPORTED_PEER and doctor
 * reports a blocking problem; a newer release only warns. The mock engine does not load
 * React Native, so the range does not apply there.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runDoctor } from "../src/cli/doctor.js";
import {
  isBelowSupportedReactNative,
  SUPPORTED_REACT_NATIVE,
  unsupportedReactNativeMessage,
} from "../src/peer-requirements.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromPackage = createRequire(path.join(PACKAGE_ROOT, "package.json"));
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("the supported React Native releases", () => {
  it("are the rows of the CI matrix", () => {
    const matrix = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, "../../.github/rn-matrix.json"), "utf8"),
    ) as { rn: string[] };
    const minors = matrix.rn.map((row) => Number(row.split(".")[1]));
    expect(SUPPORTED_REACT_NATIVE).toEqual({
      minimumMinor: Math.min(...minors),
      maximumMinor: Math.max(...minors),
    });
  });
});

describe("unsupportedReactNativeMessage", () => {
  it("says nothing for a supported release", () => {
    expect(unsupportedReactNativeMessage("0.86.0")).toBeNull();
    expect(unsupportedReactNativeMessage("0.88.0")).toBeNull();
    expect(unsupportedReactNativeMessage("0.87.1-rc.2")).toBeNull();
    expect(isBelowSupportedReactNative("0.86.0")).toBe(false);
  });

  it("names the floor below it", () => {
    expect(isBelowSupportedReactNative("0.85.3")).toBe(true);
    expect(unsupportedReactNativeMessage("0.85.3")).toBe(
      "react-native 0.85.3 is not supported: the native engine supports react-native " +
        "0.86–0.88. Upgrade react-native to 0.86 or later (Expo SDK 57 or later).",
    );
  });

  it("only warns above the range", () => {
    expect(isBelowSupportedReactNative("0.89.0")).toBe(false);
    expect(unsupportedReactNativeMessage("0.89.0")).toMatch(
      /^react-native 0\.89\.0 is newer than this release supports/,
    );
  });

  it("says nothing about a version it cannot read", () => {
    expect(unsupportedReactNativeMessage("1.0.0")).toBeNull();
    expect(isBelowSupportedReactNative("next")).toBe(false);
  });
});

describe("doctor", () => {
  /** A project whose engine resolves to native, with `react-native` at `version`. */
  function nativeProject(version: string): string {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-rn-floor-"));
    temps.push(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
    const rn = path.join(root, "node_modules", "react-native");
    fs.mkdirSync(rn, { recursive: true });
    fs.writeFileSync(
      path.join(rn, "package.json"),
      JSON.stringify({ name: "react-native", version }),
    );
    for (const name of ["@babel/core", "@react-native/babel-preset"]) {
      const target = path.join(root, "node_modules", ...name.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(path.dirname(fromPackage.resolve(`${name}/package.json`)), target, "dir");
    }
    return root;
  }

  it("reports a React Native below the floor as blocking", () => {
    const { lines, ok } = runDoctor(nativeProject("0.85.3"), "24.13.0");
    expect(lines.join("\n")).toContain("✗ react-native 0.85.3 is not supported");
    expect(ok).toBe(false);
  });

  it("passes a supported one", () => {
    const { lines } = runDoctor(nativeProject("0.86.0"), "24.13.0");
    expect(lines.join("\n")).not.toContain("react-native 0.86.0 is not supported");
    expect(lines.join("\n")).toContain("resolves to NATIVE");
  });
});

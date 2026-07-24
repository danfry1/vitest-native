import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseRNExports,
  resolveInstalledPackage,
  validateRNExportShape,
} from "../scripts/check-compat.js";

function writePackage(root: string, relativePath: string, name: string, version: string): void {
  const packageRoot = path.join(root, relativePath);
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify({ name, version, main: "index.js" })}\n`,
  );
  fs.writeFileSync(path.join(packageRoot, "index.js"), "module.exports = {};\n");
}

describe("compatibility package resolution", () => {
  it("uses the dependency resolved by the package under test", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "vn-compat-"));
    const packageRoot = path.join(workspace, "packages", "vitest-native");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{"name":"fixture"}\n');

    writePackage(workspace, "node_modules/react-native", "react-native", "0.84.1");
    writePackage(packageRoot, "node_modules/react-native", "react-native", "0.86.0");

    const resolved = resolveInstalledPackage("react-native", packageRoot);

    expect(resolved.version).toBe("0.86.0");
    expect(resolved.packageJsonPath).toBe(
      fs.realpathSync(path.join(packageRoot, "node_modules", "react-native", "package.json")),
    );
  });

  it("includes both getters and direct methods from the RN entry object", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-compat-exports-"));
    const indexPath = path.join(root, "index.js");
    fs.writeFileSync(
      indexPath,
      `module.exports = {\n  get View() { return {}; },\n  unstable_batch<T>(fn: T) { return fn; },\n};\n`,
    );

    expect(parseRNExports(indexPath)).toEqual(["View", "unstable_batch"]);
  });

  it("rejects a partial parse instead of reporting false 100% coverage", () => {
    expect(() => validateRNExportShape(["View", "Text"])).toThrow(
      "Could not confidently parse React Native's runtime exports",
    );
  });
});

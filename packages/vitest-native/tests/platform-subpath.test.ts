import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { platformSubpathFile } from "../src/native/resolve.mjs";

/** A package in a temp node_modules, with the given files. */
function pkg(name: string, files: string[]): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-subpath-")));
  const dir = path.join(root, "node_modules", name);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), "");
  }
  return dir.split(path.sep).join("/");
}

describe("platformSubpathFile: a package's extensionless subpath, as Metro resolves it (#573)", () => {
  const files = [
    "Libraries/BackHandler.js",
    "Libraries/BackHandler.ios.js",
    "Libraries/BackHandler.android.js",
  ];

  it("takes the platform file over the shim an exports map points at", () => {
    const dir = pkg("react-native", files);
    const shim = `${dir}/Libraries/BackHandler.js`;
    expect(platformSubpathFile("react-native/Libraries/BackHandler", shim, "ios")).toBe(
      path.normalize(`${dir}/Libraries/BackHandler.ios.js`),
    );
    expect(platformSubpathFile("react-native/Libraries/BackHandler", shim, "android")).toBe(
      path.normalize(`${dir}/Libraries/BackHandler.android.js`),
    );
  });

  it("works for scoped packages and directory indexes", () => {
    const dir = pkg("@scope/lib", ["sub/index.js", "sub/index.ios.js"]);
    expect(platformSubpathFile("@scope/lib/sub", `${dir}/sub/index.js`, "ios")).toBe(
      path.normalize(`${dir}/sub/index.ios.js`),
    );
  });

  it("keeps a file the subpath does not name, a request with an extension, and relative paths", () => {
    const dir = pkg("react-native", [...files, "dist/BackHandler.js"]);
    const elsewhere = `${dir}/dist/BackHandler.js`;
    expect(platformSubpathFile("react-native/Libraries/BackHandler", elsewhere, "ios")).toBeNull();
    const shim = `${dir}/Libraries/BackHandler.js`;
    expect(platformSubpathFile("react-native/Libraries/BackHandler.js", shim, "ios")).toBeNull();
    expect(platformSubpathFile("./Libraries/BackHandler", shim, "ios")).toBeNull();
    expect(platformSubpathFile("react-native", `${dir}/index.js`, "ios")).toBeNull();
  });

  it("keeps the file when there is no platform variant", () => {
    const dir = pkg("lib", ["utils.js"]);
    expect(platformSubpathFile("lib/utils", `${dir}/utils.js`, "ios")).toBeNull();
  });
});

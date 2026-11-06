/**
 * Which requires the jest.mock registry resolves (`mayIntercept` in
 * jest-compat/node-registry.mjs). A library's Jest setup registers its mocks in every
 * file; a require that cannot reach one goes straight to Node's loader, and one that
 * can must still be resolved and served the mock.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { nodeRegistry } from "../src/jest-compat/node-registry.mjs";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-reach-")));
const write = (rel: string, text = "module.exports = {};") => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
write("package.json", '{ "name": "app" }');
const appFile = write("src/app.js");
write("node_modules/lib-a/package.json", '{ "name": "lib-a", "main": "index.js" }');
const libIndex = write("node_modules/lib-a/index.js");
write("node_modules/lib-a/util.js");
write("node_modules/other/package.json", '{ "name": "other", "main": "index.js" }');
const otherIndex = write("node_modules/other/index.js");
const from = (file: string) => ({ filename: file });

const registry = nodeRegistry();
afterEach(() => registry.clear());
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("the jest.mock registry's reach", () => {
  it("reaches nothing with nothing registered", () => {
    expect(registry.mayIntercept("lib-a", from(appFile))).toBe(false);
  });

  describe("with a mock of a file in a package", () => {
    const mockUtil = () => registry.register(libIndex, "./util", () => ({}));

    it("reaches it by the package's name, and not by another package's", () => {
      mockUtil();
      expect(registry.mayIntercept("lib-a/util", from(appFile))).toBe(true);
      expect(registry.mayIntercept("other", from(appFile))).toBe(false);
    });

    it("reaches it by a path into the package from outside it", () => {
      mockUtil();
      expect(registry.mayIntercept("../lib-a/util", from(otherIndex))).toBe(true);
      expect(registry.mayIntercept("./index", from(otherIndex))).toBe(false);
    });

    // Its `react-native` or `browser` field can send a bare name to its own files.
    it("reaches it by any request the package itself makes", () => {
      mockUtil();
      expect(registry.mayIntercept("other", from(libIndex))).toBe(true);
    });

    it("reaches nothing once the mock is cleared", () => {
      mockUtil();
      registry.clear();
      expect(registry.mayIntercept("lib-a/util", from(appFile))).toBe(false);
    });
  });

  it("reaches a virtual mock of a package name by that name", () => {
    registry.register(appFile, "vn-reach-virtual", () => ({}));
    expect(registry.mayIntercept("vn-reach-virtual/sub", from(otherIndex))).toBe(true);
    expect(registry.mayIntercept("other", from(otherIndex))).toBe(false);
  });

  // A project file is reachable through an alias or any relative path, so every
  // require is resolved, as before the registry kept this index.
  it("resolves every request while a project file is mocked", () => {
    registry.register(appFile, "./app", () => ({}));
    expect(registry.mayIntercept("other", from(otherIndex))).toBe(true);
  });
});

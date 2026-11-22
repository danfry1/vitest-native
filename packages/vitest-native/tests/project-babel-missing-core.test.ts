import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rootBabelConfigFile } from "../src/fs-module-cache.js";
import { missingBabelCoreNotice } from "../src/project-babel.js";

/** A project outside this repository, so nothing resolves @babel/core for it. */
function project(files: Record<string, string>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-pb-core-")));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, name), text);
  return root;
}

describe("a Babel config without @babel/core (mock engine)", () => {
  it("says that the config is not applied", () => {
    const notice = missingBabelCoreNotice(
      project({ "package.json": "{}", "babel.config.js": "module.exports = {};" }),
      "auto",
    );
    expect(notice).toContain(
      "babel.config.js is not applied, because @babel/core is not installed",
    );
  });

  it("stays quiet with projectBabel: 'never', without a Babel config, and with @babel/core", () => {
    expect(missingBabelCoreNotice(project({ "babel.config.js": "" }), "never")).toBeNull();
    expect(missingBabelCoreNotice(project({ "package.json": "{}" }), "auto")).toBeNull();
    // A project inside this package resolves @babel/core from the package's node_modules.
    const cache = path.resolve(import.meta.dirname, "..", "node_modules", ".cache");
    fs.mkdirSync(cache, { recursive: true });
    const withCore = fs.mkdtempSync(path.join(cache, "vn-pb-core-"));
    try {
      fs.writeFileSync(path.join(withCore, "babel.config.js"), "module.exports = {};");
      expect(missingBabelCoreNotice(withCore, "auto")).toBeNull();
    } finally {
      fs.rmSync(withCore, { recursive: true, force: true });
    }
  });

  it("finds the root config by file name or in package.json", () => {
    expect(rootBabelConfigFile(project({ ".babelrc": "{}" }))).toBe(".babelrc");
    expect(rootBabelConfigFile(project({ "package.json": '{"babel":{}}' }))).toBe(
      "package.json#babel",
    );
    expect(rootBabelConfigFile(project({ "package.json": "{}" }))).toBeNull();
  });
});
